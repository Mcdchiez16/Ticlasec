"""Authenticated account linking and provider-authenticated webhook ingress."""
import hashlib
import hmac
import json
import re
import secrets
import time
import asyncio
import uuid
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from api.auth import CurrentUser, get_current_user, require_password_not_reset_pending
from channels.providers import env, provider_status
from channels.service import accept_message
from db.models import ChannelConnection, User
from channels import qr_bridge
from db.session import get_session

router = APIRouter(prefix="/channels", tags=["channels"])
Provider = Literal["telegram", "whatsapp"]


class LinkRequest(BaseModel):
    provider: Provider
    consent: bool = False
    model: str = Field(default="gpt-4o-mini", min_length=1, max_length=150)


@router.get("")
async def list_channels(response: Response, current: CurrentUser = Depends(get_current_user)):
    response.headers["Cache-Control"] = "no-store"
    with get_session() as session:
        result = []
        for provider in ("telegram", "whatsapp"):
            row = session.query(ChannelConnection).filter_by(user_id=current.user.id, provider=provider).first()
            item = {**provider_status(provider, transport=row.transport if row and row.external_id else None), "connected": bool(row and row.external_id),
                           "identity": f"••••{row.external_id[-4:]}" if row and row.external_id else None,
                           "linked_at": row.linked_at if row else None,
                           "model": row.model if row else None, "has_session": bool(row)}
            if row and row.transport == "qr":
                item["_session_id"] = str(row.id)
            result.append(item)
    for item in result:
        session_id = item.pop("_session_id", None)
        if session_id:
            try:
                status = await qr_bridge.call("GET", session_id)
                item["connection_status"] = status.get("status", "disconnected")
            except qr_bridge.BridgeUnavailable:
                item["connection_status"] = "unavailable"
            item["connected"] = item["connected"] and item["connection_status"] == "connected"
    return {"items": result}


@router.post("/link")
def create_link(body: LinkRequest, response: Response,
                current: CurrentUser = Depends(require_password_not_reset_pending)):
    response.headers["Cache-Control"] = "no-store"
    if not body.consent:
        raise HTTPException(422, "Consent to sending case information through this provider is required.")
    if not body.model.strip():
        raise HTTPException(422, "Choose a chat investigation model.")
    if body.provider == "whatsapp" and qr_bridge.enabled():
        raise HTTPException(409, "Use Scan WhatsApp QR in Channels to link your device.")
    if not provider_status(body.provider)["configured"]:
        raise HTTPException(409, "The operator must configure this provider and its HTTPS webhook first.")
    now = int(time.time())
    code = secrets.token_urlsafe(24)
    try:
        with get_session() as session:
            row = session.query(ChannelConnection).filter_by(user_id=current.user.id, provider=body.provider).with_for_update().first()
            if row and row.external_id:
                raise HTTPException(409, "Already connected. Disconnect before linking a different account.")
            if row and row.code_expires_at > now + 540:
                raise HTTPException(429, "Please wait one minute before requesting another link code.")
            if row is None:
                row = ChannelConnection(user_id=current.user.id, provider=body.provider)
                session.add(row)
            row.code_hash = hashlib.sha256(code.encode()).hexdigest()
            row.transport = "api"
            row.code_expires_at = now + 600
            row.model = body.model.strip()
    except IntegrityError as exc:
        raise HTTPException(409, "A linking request is already in progress. Try again.") from exc
    if body.provider == "telegram":
        username = env("TELEGRAM_BOT_USERNAME").lstrip("@")
        if not re.fullmatch(r"[A-Za-z0-9_]{5,32}", username):
            raise HTTPException(503, "Operator must configure a valid Telegram bot username.")
        url = f"https://t.me/{username}?start={quote(code)}"
    else:
        number = env("WHATSAPP_BUSINESS_NUMBER").lstrip("+")
        if not re.fullmatch(r"\d{7,15}", number):
            raise HTTPException(503, "Operator must configure the WhatsApp business number.")
        url = f"https://wa.me/{number}?text={quote('link ' + code)}"
    return {"url": url, "command": f"link {code}", "expires_at": now + 600}


def disconnect(provider: Provider, current: CurrentUser):
    with get_session() as session:
        row = session.query(ChannelConnection).filter_by(user_id=current.user.id, provider=provider).with_for_update().first()
        if row:
            if row.transport == "qr":
                from jobqueue import enqueue
                enqueue(session, "whatsapp_revoke", {"connection_id": str(row.id)}, priority=1, max_attempts=10)
            session.delete(row)
    return {"disconnected": True}


class QRStartRequest(BaseModel):
    consent: bool = False
    unofficial_ack: bool = False
    model: str = Field(default="gpt-4o-mini", min_length=1, max_length=150)


@router.post("/whatsapp/qr")
async def start_whatsapp_qr(body: QRStartRequest, response: Response,
                            current: CurrentUser = Depends(require_password_not_reset_pending)):
    response.headers["Cache-Control"] = "no-store"
    if not body.consent or not body.unofficial_ack:
        raise HTTPException(422, "Accept the messaging disclosure and unofficial linked-device risks first.")
    if not body.model.strip():
        raise HTTPException(422, "Choose an investigation model.")
    if not qr_bridge.enabled():
        raise HTTPException(409, "QR connection mode is not enabled on this installation.")
    if not qr_bridge.bridge_secret():
        raise HTTPException(503, "The WhatsApp QR service is starting. Try again shortly.")
    try:
        with get_session() as session:
            row = session.query(ChannelConnection).filter_by(user_id=current.user.id, provider="whatsapp").with_for_update().first()
            if row and row.transport != "qr":
                raise HTTPException(409, "Disconnect the existing WhatsApp API link before scanning a QR code.")
            if row is None:
                row = ChannelConnection(user_id=current.user.id, provider="whatsapp", transport="qr", model=body.model.strip())
                session.add(row)
            elif not row.external_id:
                row.model = body.model.strip()
            session.flush()
            connection_id = str(row.id)
    except IntegrityError as exc:
        raise HTTPException(409, "A connection request is already in progress. Try again.") from exc
    try:
        return await qr_bridge.call("POST", connection_id)
    except qr_bridge.BridgeUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


@router.get("/whatsapp/qr")
async def get_whatsapp_qr(response: Response, current: CurrentUser = Depends(get_current_user)):
    response.headers["Cache-Control"] = "no-store"
    with get_session() as session:
        row = session.query(ChannelConnection).filter_by(user_id=current.user.id, provider="whatsapp", transport="qr").first()
        connection_id = str(row.id) if row else None
    if connection_id is None:
        return {"status": "disconnected"}
    try:
        return await qr_bridge.call("GET", connection_id)
    except qr_bridge.BridgeUnavailable as exc:
        raise HTTPException(503, str(exc)) from exc


def _require_bridge(request: Request):
    secret = qr_bridge.bridge_secret()
    supplied = request.headers.get("authorization", "")
    if not secret or not hmac.compare_digest(f"Bearer {secret}".encode(), supplied.encode()):
        raise HTTPException(401, "Invalid bridge authentication")


class BridgeEvent(BaseModel):
    connection_id: uuid.UUID
    event: Literal["authorize", "connected", "message"]
    account: str = Field(default="", max_length=30)
    event_id: str = Field(default="", max_length=100)
    text: str = Field(default="", max_length=1000)
    sent_at: int = 0
    self_chat: bool = False


@router.post("/bridge/event", dependencies=[Depends(_require_bridge)])
def bridge_event(body: BridgeEvent):
    """Only the private bridge can bind a successfully paired device to its owner."""
    try:
        with get_session() as session:
            row = session.query(ChannelConnection).filter_by(id=body.connection_id, provider="whatsapp", transport="qr").with_for_update().first()
            user = session.get(User, row.user_id) if row else None
            if not row or not user or not user.is_active or user.must_reset_password or not qr_bridge.enabled():
                raise HTTPException(410, "Session revoked")
            if body.event == "authorize":
                return {"allowed": True}
            if not re.fullmatch(r"\d{7,20}", body.account):
                raise HTTPException(422, "Invalid account identity")
            if row.external_id and row.external_id != body.account:
                raise HTTPException(409, "The session account cannot be changed. Disconnect first.")
            if body.event == "connected":
                row.external_id = body.account
                row.linked_at = row.linked_at or int(time.time())
                return {"accepted": True}
            if not body.self_chat or not row.external_id or not body.event_id:
                raise HTTPException(422, "Only a linked account's self-chat commands are accepted")
    except IntegrityError as exc:
        raise HTTPException(409, "This WhatsApp account is already linked to another user.") from exc
    accept_message("whatsapp", f"{body.connection_id}:{body.event_id}", body.account,
                   body.text, body.sent_at, transport="qr", connection_id=str(body.connection_id))
    return {"accepted": True}


@router.delete("/telegram")
def disconnect_telegram(current: CurrentUser = Depends(get_current_user)):
    return disconnect("telegram", current)


@router.delete("/whatsapp")
def disconnect_whatsapp(current: CurrentUser = Depends(get_current_user)):
    return disconnect("whatsapp", current)


async def _body(request: Request) -> bytes:
    raw = bytearray()
    async for chunk in request.stream():
        raw.extend(chunk)
        if len(raw) > 1024 * 1024:
            raise HTTPException(413, "Webhook body too large")
    return bytes(raw)


def _json(raw):
    try:
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except (ValueError, UnicodeDecodeError) as exc:
        raise HTTPException(400, "Invalid webhook payload") from exc


@router.post("/webhooks/telegram")
async def telegram_webhook(request: Request):
    secret = env("TELEGRAM_WEBHOOK_SECRET")
    supplied = request.headers.get("x-telegram-bot-api-secret-token", "")
    if not secret or not hmac.compare_digest(secret.encode(), supplied.encode()):
        raise HTTPException(401, "Invalid webhook authentication")
    payload = _json(await _body(request))
    message = payload.get("message") or {}
    if not isinstance(message, dict):
        raise HTTPException(400, "Invalid message")
    chat, sender = message.get("chat") or {}, message.get("from") or {}
    if not isinstance(chat, dict) or not isinstance(sender, dict):
        raise HTTPException(400, "Invalid private chat")
    # Only direct messages from the chat's human owner, never groups/channels/bots.
    if (chat.get("type") == "private" and not sender.get("is_bot")
        and chat.get("id") == sender.get("id") and isinstance(message.get("text"), str)
        and isinstance(payload.get("update_id"), int) and isinstance(message.get("date"), int)):
        await asyncio.to_thread(accept_message, "telegram", str(payload["update_id"]), str(sender.get("id")),
                                message["text"], message["date"])
    return {"ok": True}


@router.get("/webhooks/whatsapp")
async def whatsapp_verify(request: Request):
    token = env("WHATSAPP_VERIFY_TOKEN")
    params = request.query_params
    if (params.get("hub.mode") != "subscribe" or not token
        or not hmac.compare_digest(token.encode(), params.get("hub.verify_token", "").encode())):
        raise HTTPException(403, "Invalid verification token")
    challenge = params.get("hub.challenge", "")
    if not challenge.isdigit() or len(challenge) > 100:
        raise HTTPException(400, "Invalid challenge")
    return Response(challenge, media_type="text/plain")


@router.post("/webhooks/whatsapp")
async def whatsapp_webhook(request: Request):
    raw = await _body(request)
    secret = env("WHATSAPP_APP_SECRET")
    expected = "sha256=" + hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    supplied = request.headers.get("x-hub-signature-256", "")
    if not secret or not hmac.compare_digest(expected.encode(), supplied.encode()):
        raise HTTPException(401, "Invalid webhook signature")
    payload = _json(raw)
    if payload.get("object") != "whatsapp_business_account":
        return {"ok": True}
    try:
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                if (change.get("field") != "messages" or not env("WHATSAPP_PHONE_NUMBER_ID")
                    or str(value.get("metadata", {}).get("phone_number_id")) != env("WHATSAPP_PHONE_NUMBER_ID")):
                    continue
                for message in value.get("messages", []):
                    if message.get("type") == "text":
                        if not isinstance(message.get("text", {}).get("body"), str):
                            raise ValueError("Text required")
                        await asyncio.to_thread(accept_message, "whatsapp", str(message.get("id", "")), str(message.get("from", "")),
                                                message["text"]["body"], int(message["timestamp"]))
    except (KeyError, TypeError, ValueError, AttributeError) as exc:
        raise HTTPException(400, "Malformed WhatsApp message") from exc
    return {"ok": True}

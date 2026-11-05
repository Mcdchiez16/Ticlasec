"""Short owner-scoped transactions for chat commands, with durable replies."""
import hashlib
import re
import time
import uuid

from sqlalchemy.exc import IntegrityError
from db.models import ChannelConnection, ChannelEvent, Investigation, Monitor, User
from db.session import get_session
from jobqueue import enqueue
from channels.providers import send_message
from research_evaluation.safety import defang_research_text, research_mode

HELP = ("TiclaSec commands:\n"
        "investigate <topic> — start a Fast investigation\n"
        "cases — your five most recent investigations\n"
        "status <case ID> — progress and counts\n"
        "brief <case ID> — collected-evidence briefing\n"
        "monitors — your watchlists\nhelp — this guide\n"
        "Slashes are optional. Only your account's cases are accessible. "
        "Disconnect at any time in the website's Channels section.")


def connected_account(session, user_id, provider):
    return session.query(ChannelConnection).filter_by(user_id=user_id, provider=provider).filter(
        ChannelConnection.external_id.isnot(None)).first()


def _reply(session, connection, message):
    enqueue(session, "channel_reply", {"connection_id": str(connection.id), "text": message[:4000]},
            priority=10)


def _command(session, connection, command, argument, now):
    owner = connection.user_id
    if command in {"help", "start"}:
        return HELP
    if command == "cases":
        rows = session.query(Investigation).filter_by(user_id=owner).order_by(Investigation.created_at.desc()).limit(5).all()
        return "Your recent cases:\n" + "\n\n".join(
            f"{r.run_id}\n{r.status} · {defang_research_text(r.query[:150])}" for r in rows) if rows else "No investigations yet. Send investigate <topic>."
    if command == "monitors":
        rows = session.query(Monitor).filter_by(user_id=owner, deleted=False).limit(20).all()
        return "Your watchlists:\n" + "\n".join(
            f"{r.name[:100]} · {'active' if r.enabled else 'paused'} · every {r.config.get('interval_hours')}h" for r in rows) if rows else "No watchlists yet. Create one on the Monitoring page."
    if command in {"status", "brief"}:
        try:
            case_id = uuid.UUID(argument)
        except ValueError:
            return "Send cases to get a case ID, then status <case ID> or brief <case ID>."
        row = session.query(Investigation).filter_by(user_id=owner, run_id=case_id).first()
        if row is None:
            return "Case not found in your account. Send cases for your case IDs."
        if command == "brief":
            return (f"Case {row.run_id}\nEvidence briefing (source claims need verification):\n" +
                    defang_research_text(row.summary[:3500])) if row.summary else f"Case {row.run_id}: {row.status}. No briefing available yet."
        return f"Case {row.run_id}: {row.status}\n{row.current_step_label or ''}\n{row.page_count} pages · {row.entity_count} entities"
    if command == "investigate":
        if research_mode():
            return "Live collection is paused by the operator. Existing cases remain accessible."
        if not 3 <= len(argument) <= 500:
            return "Use investigate <topic>, with a topic between 3 and 500 characters."
        from utils.content_safety import is_blocked_query
        if is_blocked_query(argument)[0]:
            return "This query cannot be processed. Use TiclaSec for legitimate security research only."
        if now - connection.last_investigation_at < 60:
            return "Please wait one minute between investigation requests."
        active = session.query(Investigation).filter_by(user_id=owner).filter(
            Investigation.status.in_(["pending", "running", "processing"])).count()
        if active >= 3:
            return "You already have three active investigations. Send cases to check their progress."
        from intelligence_scope import normalize_scope
        scope = normalize_scope({"profile_id": "global"})
        row = Investigation(user_id=owner, query=argument, preset="fast", status="pending",
                            metadata_json={"intelligence_scope": scope, "channel": connection.provider})
        session.add(row)
        session.flush()
        enqueue(session, "investigation", {"investigation_id": str(row.id), "run_id": str(row.run_id),
            "query": argument, "model": connection.model, "depth": "fast", "run_crawler": False,
            "intelligence_scope": scope}, dedup_key=str(row.id))
        connection.last_investigation_at = now
        return (f"Investigation queued.\nCase ID: {row.run_id}\nModel: {connection.model}\n"
                f"Send status {row.run_id} for progress, or brief {row.run_id} for the briefing.")
    return "Unknown command. Send help for commands, or investigate <topic> to start a case."


def accept_message(provider: str, event_id: str, sender: str, text: str, sent_at: int,
                   *, transport: str = "api", connection_id: str | None = None) -> None:
    """Authenticate transport first. Atomically deduplicate, execute and queue reply.

    No external calls while holding DB locks. A provider retry cannot start a
    second investigation. Missing/expired links never expose account content.
    """
    now = int(time.time())
    if not event_id or len(event_id) > 255 or not re.fullmatch(r"\d{1,100}", sender):
        return
    if abs(now - sent_at) > 3600 or len(text) > 1000:
        return
    parts = text.strip().split(maxsplit=1)
    command = parts[0].lstrip("/").split("@")[0].lower() if parts else "help"
    argument = parts[1].strip() if len(parts) > 1 else ""
    try:
        with get_session() as session:
            if session.query(ChannelEvent.id).filter_by(provider=provider, external_id=event_id).first():
                return
            query = session.query(ChannelConnection).filter_by(provider=provider, external_id=sender, transport=transport)
            if connection_id:
                query = query.filter_by(id=uuid.UUID(connection_id))
            connection = query.with_for_update().first()
            if transport == "api" and command in {"link", "start"} and argument:
                # Never move an identity between accounts through a chat command.
                if connection is not None:
                    return
                digest = hashlib.sha256(argument.encode()).hexdigest()
                connection = session.query(ChannelConnection).filter_by(provider=provider, code_hash=digest, transport="api").with_for_update().first()
                if connection is None or connection.external_id or connection.code_expires_at <= now:
                    return
                connection.external_id = sender
                connection.code_hash = None
                connection.code_expires_at = 0
                connection.linked_at = now
                response = "Your TiclaSec account is now connected.\n\n" + HELP
            else:
                if connection is None:
                    return
                if now - connection.last_command_at < 2:
                    return
                response = None
            user = session.query(User).filter_by(id=connection.user_id).with_for_update().first()
            if user is None or not user.is_active or user.must_reset_password:
                session.rollback()
                return
            # Same transaction as the side effects; unique constraint handles races.
            session.add(ChannelEvent(provider=provider, external_id=event_id, created_at=now))
            session.flush()
            connection.last_inbound_at = max(connection.last_inbound_at, sent_at)
            connection.last_command_at = now
            if response is None:
                response = _command(session, connection, command, argument, now)
            if transport == "qr":
                response += "\n\nIn Message yourself, prefix commands with /ticla (e.g. /ticla cases)."
            _reply(session, connection, response)
            session.query(ChannelEvent).filter(ChannelEvent.created_at < now - 7 * 86400).delete()
    except IntegrityError:
        # Duplicate provider delivery or concurrent identity linking: rolled back.
        return


async def deliver_reply(payload: dict) -> None:
    with get_session() as session:
        connection = session.get(ChannelConnection, uuid.UUID(payload["connection_id"]))
        if connection is None or not connection.external_id:
            return  # revoked links also revoke already-queued replies
        user = session.get(User, connection.user_id)
        if user is None or not user.is_active or user.must_reset_password:
            return
        provider, recipient, last_seen = connection.provider, connection.external_id, connection.last_inbound_at
        transport, connection_id = connection.transport, str(connection.id)
    if transport == "qr":
        from channels.qr_bridge import send_self
        if not await send_self(connection_id, payload["text"]):
            raise RuntimeError("WhatsApp linked-device delivery failed. Reconnect from Channels if needed.")
        return
    if not await send_message(provider, recipient, payload["text"], last_seen):
        raise RuntimeError("Channel delivery failed or the WhatsApp reply window has expired.")


async def send_connected_alert(user_id: int, provider: str, text: str) -> bool:
    with get_session() as session:
        connection = connected_account(session, user_id, provider)
        user = session.get(User, user_id)
        if connection is None or not user or not user.is_active or user.must_reset_password:
            return False
        recipient, last_seen = connection.external_id, connection.last_inbound_at
        transport, connection_id = connection.transport, str(connection.id)
    if transport == "qr":
        from channels.qr_bridge import send_self
        return await send_self(connection_id, defang_research_text(text))
    return await send_message(provider, recipient, defang_research_text(text), last_seen)

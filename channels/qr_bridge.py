"""Private network client; the browser never sees the bridge credential."""
import os
import uuid
from pathlib import Path
import aiohttp


def enabled() -> bool:
    return (os.getenv("WHATSAPP_MODE") or "cloud").strip().lower() == "qr"


def bridge_secret() -> str:
    path = os.getenv("WHATSAPP_BRIDGE_SECRET_FILE")
    if not path:
        return ""
    try:
        value = Path(path).read_text().strip()
        return value if len(value) >= 32 else ""
    except OSError:
        return ""


class BridgeUnavailable(Exception):
    pass


async def call(method: str, connection_id: str, action: str = "", payload=None) -> dict:
    connection_id = str(uuid.UUID(connection_id))
    if action not in {"", "/send"}:
        raise ValueError("Invalid bridge action")
    secret = bridge_secret()
    if (not enabled() and method != "DELETE") or not secret:
        raise BridgeUnavailable("The WhatsApp QR service is not ready. Try again shortly.")
    # Operator-configured private origin, never taken from a request or message.
    origin = (os.getenv("WHATSAPP_BRIDGE_URL") or "http://whatsapp-bridge:8090").rstrip("/")
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=5 if method == "GET" else 12)) as session:
            async with session.request(method, f"{origin}/sessions/{connection_id}{action}",
                headers={"Authorization": f"Bearer {secret}"}, json=payload, allow_redirects=False) as response:
                if response.status == 404 and method in {"GET", "DELETE"}:
                    return {"status": "disconnected"}
                if response.status not in {200, 201, 202}:
                    raise BridgeUnavailable("WhatsApp QR service could not complete this request. Try again shortly.")
                return await response.json()
    except (aiohttp.ClientError, TimeoutError, ValueError) as exc:
        raise BridgeUnavailable("WhatsApp QR service is unreachable. Check that its container is running.") from exc


async def send_self(connection_id: str, text: str) -> bool:
    try:
        result = await call("POST", connection_id, "/send", {"text": text[:4000]})
        return result.get("sent") is True
    except BridgeUnavailable:
        return False


async def revoke_session(payload: dict) -> None:
    await call("DELETE", payload["connection_id"])

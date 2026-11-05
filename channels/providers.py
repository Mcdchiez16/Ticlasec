"""Fixed-host provider transports. No credentials are returned to the browser."""
import os
import re
import time
import aiohttp


def env(name: str) -> str:
    return (os.getenv(name) or "").strip()


def provider_status(provider: str, *, transport=None) -> dict:
    from channels.qr_bridge import enabled, bridge_secret
    if provider == "whatsapp" and transport != "api" and enabled():
        ready = bool(bridge_secret())
        return {"provider": provider, "configured": ready, "connection_mode": "qr",
                "missing": [] if ready else ["WhatsApp QR bridge service"]}
    required = {
        "telegram": ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_USERNAME", "TELEGRAM_WEBHOOK_SECRET"],
        "whatsapp": ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_BUSINESS_NUMBER",
                     "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN", "WHATSAPP_API_VERSION"],
    }[provider]
    missing = [key for key in required if not env(key)]
    if provider == "whatsapp" and env("WHATSAPP_API_VERSION") and not re.fullmatch(r"v\d+\.\d+", env("WHATSAPP_API_VERSION")):
        missing.append("WHATSAPP_API_VERSION (use vNN.0)")
    return {"provider": provider, "configured": not missing, "missing": missing,
            "connection_mode": "cloud" if provider == "whatsapp" else "bot"}


async def send_message(provider: str, recipient: str, text: str, last_inbound_at: int) -> bool:
    if not provider_status(provider, transport="api")["configured"]:
        return False
    if provider == "telegram":
        url = f"https://api.telegram.org/bot{env('TELEGRAM_BOT_TOKEN')}/sendMessage"
        headers = {}
        payload = {"chat_id": recipient, "text": text[:4000], "link_preview_options": {"is_disabled": True}}
    else:
        # Free-form Cloud API messages require an open customer-service window.
        # Do not pretend an alert was delivered outside that window.
        if time.time() - last_inbound_at >= 24 * 3600:
            return False
        phone_id = env("WHATSAPP_PHONE_NUMBER_ID")
        if not phone_id.isdigit():
            return False
        url = f"https://graph.facebook.com/{env('WHATSAPP_API_VERSION')}/{phone_id}/messages"
        headers = {"Authorization": f"Bearer {env('WHATSAPP_ACCESS_TOKEN')}"}
        payload = {"messaging_product": "whatsapp", "to": recipient, "type": "text",
                   "text": {"body": text[:4000], "preview_url": False}}
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=12)) as session:
            async with session.post(url, headers=headers, json=payload, allow_redirects=False) as response:
                if response.status != 200:
                    return False
                body = await response.json()
                return body.get("ok") is True if provider == "telegram" else bool(body.get("messages"))
    except (aiohttp.ClientError, TimeoutError, ValueError):
        # Exception messages may contain the bot token in the URL. Do not log them.
        return False

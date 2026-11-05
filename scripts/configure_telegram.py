"""Operator-run registration; never prints bot credentials or API response bodies."""
import argparse
import asyncio
import re
from urllib.parse import urlsplit
import aiohttp
from channels.providers import env, provider_status


async def configure(public_url: str):
    parsed = urlsplit(public_url)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
        or parsed.query or parsed.fragment or parsed.path not in {"", "/"}):
        raise SystemExit("Provide the public HTTPS site origin, e.g. https://intelligence.example.org")
    if not provider_status("telegram")["configured"]:
        raise SystemExit("Set TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME and TELEGRAM_WEBHOOK_SECRET on the server first.")
    secret = env("TELEGRAM_WEBHOOK_SECRET")
    if not re.fullmatch(r"[A-Za-z0-9_-]{32,256}", secret):
        raise SystemExit("Use a random Telegram webhook secret with 32–256 letters, digits, underscores or hyphens.")
    endpoint = f"https://api.telegram.org/bot{env('TELEGRAM_BOT_TOKEN')}"
    try:
        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=20)) as session:
            async with session.get(endpoint + "/getMe", allow_redirects=False) as response:
                identity = await response.json()
                if response.status != 200 or not identity.get("ok"):
                    raise SystemExit("Telegram rejected the bot credentials. Check the token privately.")
                if identity.get("result", {}).get("username", "").lower() != env("TELEGRAM_BOT_USERNAME").lstrip("@").lower():
                    raise SystemExit("The configured bot username does not match the token.")
            async with session.post(endpoint + "/setWebhook", json={
                "url": public_url.rstrip("/") + "/api/channels/webhooks/telegram",
                "secret_token": secret, "allowed_updates": ["message"],
            }, allow_redirects=False) as response:
                result = await response.json()
                if response.status != 200 or not result.get("ok"):
                    raise SystemExit("Telegram rejected webhook registration. Check the public HTTPS address.")
    except (aiohttp.ClientError, TimeoutError, ValueError):
        raise SystemExit("Could not reach Telegram. No credentials have been printed.") from None
    print("Telegram webhook registered. Open Monitoring → Channels and link your account.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-url", required=True)
    asyncio.run(configure(parser.parse_args().public_url))

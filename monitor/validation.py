"""Shared validation for API and imported URL watchlists."""
import ipaddress
from urllib.parse import urlsplit, urlunsplit

MAX_URLS = 25
MIN_INTERVAL_HOURS = 0.5
MAX_INTERVAL_HOURS = 24 * 30


def normalize_urls(urls: list[str] | None, legacy_url: str | None = None) -> list[str]:
    values = urls if urls is not None else ([legacy_url] if legacy_url else [])
    if not values or len(values) > MAX_URLS:
        raise ValueError(f"Enter between 1 and {MAX_URLS} links.")
    result = []
    for value in values:
        value = value.strip()
        if len(value) > 2048 or any(c.isspace() for c in value):
            raise ValueError("Each link must be a valid HTTP or HTTPS URL.")
        try:
            parsed = urlsplit(value)
            host = (parsed.hostname or "").lower()
            port = parsed.port
        except ValueError as exc:
            raise ValueError("Invalid URL or port.") from exc
        if parsed.scheme not in {"http", "https"} or not host or parsed.username or parsed.password:
            raise ValueError("Use complete http:// or https:// links without embedded credentials.")
        if host in {"localhost", "host.docker.internal"} or host.endswith((".localhost", ".local", ".internal")):
            raise ValueError("Local and internal addresses cannot be monitored.")
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            address = None
        if address is not None and not address.is_global:
            raise ValueError("Local and private IP addresses cannot be monitored.")
        netloc = f"[{host}]" if ":" in host else host
        if port and not (parsed.scheme == "http" and port == 80 or parsed.scheme == "https" and port == 443):
            netloc += f":{port}"
        normalized = urlunsplit((parsed.scheme, netloc, parsed.path or "/", parsed.query, ""))
        if normalized not in result:
            result.append(normalized)
    return result

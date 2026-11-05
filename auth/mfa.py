"""RFC 6238 TOTP with replay protection and hashed one-use recovery codes."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import struct
import time

from cryptography.fernet import Fernet


def cipher() -> Fernet:
    inline_key = (os.getenv("TICLASEC_MFA_KEY") or "").strip()
    if inline_key:
        return Fernet(inline_key.encode())
    location = os.getenv("TICLASEC_MFA_KEY_FILE")
    if not location:
        raise RuntimeError("MFA encryption key is not configured")
    return Fernet(Path(location).read_bytes().strip())


def new_secret() -> str:
    return base64.b32encode(secrets.token_bytes(20)).decode()


def totp(secret: str, counter: int, digits: int = 6) -> str:
    digest = hmac.new(base64.b32decode(secret), struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 15
    code = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7fffffff) % (10 ** digits)
    return str(code).zfill(digits)


def consume(factor, code: str, now: float | None = None, allow_recovery=True) -> bool:
    code = code.strip().replace(" ", "")
    if allow_recovery and len(code) == 20:
        digest = hashlib.sha256(code.encode()).hexdigest()
        hashes = json.loads(factor.recovery_hashes)
        match = next((v for v in hashes if hmac.compare_digest(v, digest)), None)
        if match:
            factor.recovery_hashes = json.dumps([v for v in hashes if v != match])
            return True
    if len(code) != 6 or not code.isdigit():
        return False
    secret = cipher().decrypt(factor.encrypted_secret.encode()).decode()
    counter = int((time.time() if now is None else now) // 30)
    for candidate in (counter, counter - 1, counter + 1):
        if candidate > factor.last_counter and hmac.compare_digest(totp(secret, candidate), code):
            factor.last_counter = candidate
            return True
    return False


def recovery_codes() -> tuple[list[str], str]:
    codes = [secrets.token_hex(10) for _ in range(8)]
    return codes, json.dumps([hashlib.sha256(code.encode()).hexdigest() for code in codes])

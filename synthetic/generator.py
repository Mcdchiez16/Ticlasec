"""Deterministic fake identifiers for synthetic scenarios.

Everything here is derived from a seeded :class:`random.Random`, so a scenario
produces the same wallets, hosts and hashes on every run (a demo must not change
between rehearsal and presentation). The values are well-formed but belong to
nobody: onion hosts carry no valid checksum, wallet addresses are random hashes,
and domains are random labels. The extractor discards reserved documentation values
(RFC 5737 addresses, ``.example`` domains), so infrastructure is made of random-label
domains instead; if one of them happens to exist, that is a coincidence.
"""

from __future__ import annotations

import hashlib
import random

_B32 = "abcdefghijklmnopqrstuvwxyz234567"
_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def onion_host(rng: random.Random) -> str:
    """A v3-shaped onion host (56 base32 characters + ``.onion``). Not a real service."""
    return "".join(rng.choice(_B32) for _ in range(55)) + "d.onion"


def _b58encode(raw: bytes) -> str:
    n = int.from_bytes(raw, "big")
    out = ""
    while n:
        n, r = divmod(n, 58)
        out = _B58[r] + out
    pad = len(raw) - len(raw.lstrip(b"\0"))
    return _B58[0] * pad + out


def btc_address(rng: random.Random) -> str:
    """A syntactically valid (checksummed) P2PKH address derived from random bytes."""
    payload = b"\x00" + bytes(rng.getrandbits(8) for _ in range(20))
    check = hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]
    return _b58encode(payload + check)


def eth_address(rng: random.Random) -> str:
    return "0x" + "".join(rng.choice("0123456789abcdef") for _ in range(40))


def _keccak256(data: bytes) -> bytes:
    """Keccak-256 if a library is installed, else a stand-in digest.

    The extractor validates Monero checksums with the same libraries, so where neither
    is installed it cannot recognise any Monero address and the stand-in changes nothing.
    """
    try:
        from Crypto.Hash import keccak

        return keccak.new(digest_bits=256, data=data).digest()
    except ImportError:
        pass
    try:
        from eth_hash.auto import keccak as _k

        return _k(data)
    except ImportError:
        return hashlib.sha3_256(data).digest()


def xmr_address(rng: random.Random) -> str:
    """A Monero-shaped address whose checksum passes the extractor's validation.

    Mirrors ``extractor.normalizer._validate_monero_address``: eight 11-character
    blocks of random base58, then a 7-character block encoding one random byte
    followed by the first four bytes of keccak256 over everything before it.
    """
    def decode(block: str) -> bytes:
        n = 0
        for ch in block:
            n = n * 58 + _B58.index(ch)
        raw = n.to_bytes((n.bit_length() + 7) // 8, "big") if n else b""
        return b"\x00" * (len(block) - len(block.lstrip("1"))) + raw

    blocks = []
    for i in range(8):
        chars = [rng.choice(_B58[1:]) for _ in range(11)]  # no leading '1'
        if i == 0:
            chars[0], chars[1] = "4", rng.choice("23456789AB")
        blocks.append("".join(chars))
    body = b"".join(decode(b) for b in blocks)
    x = rng.randint(10, 255)  # >= 10 keeps the last block 7 characters with no leading '1'
    value = int.from_bytes(bytes([x]) + _keccak256(body + bytes([x]))[:4], "big")
    tail = ""
    for _ in range(7):
        value, r = divmod(value, 58)
        tail = _B58[r] + tail
    return "".join(blocks) + tail


def sha256(rng: random.Random) -> str:
    return "".join(rng.choice("0123456789abcdef") for _ in range(64))


def md5(rng: random.Random) -> str:
    return "".join(rng.choice("0123456789abcdef") for _ in range(32))


_TLDS = ("top", "xyz", "site", "click", "online")
_STEMS = ("cdn", "update", "secure", "static", "sync", "login", "portal", "cloud")


def c2_domain(rng: random.Random) -> str:
    """A throwaway-looking domain such as ``update-q7f2x9.top``."""
    label = "".join(rng.choice("abcdefghjkmnpqrstuvwxyz23456789") for _ in range(7))
    return f"{rng.choice(_STEMS)}-{label}.{rng.choice(_TLDS)}"

import base64
import time
from types import SimpleNamespace

from cryptography.fernet import Fernet
from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from auth.mfa import cipher, totp, consume, recovery_codes
from api.auth import hash_password, decode_token
from api.routes.auth import router
from db.models import User
from db.session import get_db


def test_totp_rfc6238_vectors():
    secret = base64.b32encode(b"12345678901234567890").decode()
    for seconds, expected in [(59, "94287082"), (1111111109, "07081804"), (1111111111, "14050471"), (1234567890, "89005924"), (2000000000, "69279037"), (20000000000, "65353130")]:
        assert totp(secret, seconds // 30, digits=8) == expected


@pytest.fixture
def key(tmp_path, monkeypatch):
    key = Fernet.generate_key()
    path = tmp_path / "mfa.key"; path.write_bytes(key)
    monkeypatch.setenv("TICLASEC_MFA_KEY_FILE", str(path))
    return key


def test_replay_skew_and_single_use_recovery(key):
    secret = base64.b32encode(b"12345678901234567890").decode()
    factor = SimpleNamespace(encrypted_secret=Fernet(key).encrypt(secret.encode()).decode(), last_counter=-1, recovery_hashes="[]")
    assert consume(factor, totp(secret, 100), now=3000)
    assert not consume(factor, totp(secret, 100), now=3000)
    assert not consume(factor, totp(secret, 98), now=3000)
    assert consume(factor, totp(secret, 101), now=3000)
    codes, hashes = recovery_codes(); factor.recovery_hashes = hashes
    assert all(code not in hashes for code in codes)
    assert consume(factor, codes[0], now=3000)
    assert not consume(factor, codes[0], now=3000)


@pytest.fixture
def client(db_engine, key):
    with Session(db_engine) as session:
        session.add(User(email="mfa@example.test", hashed_password=hash_password("Testing12345"), is_active=True, must_reset_password=False))
        session.commit()
    def db():
        with Session(db_engine) as session:
            yield session
    app = FastAPI(); app.include_router(router); app.dependency_overrides[get_db] = db
    with TestClient(app) as client:
        yield client


def test_enrollment_old_sessions_login_and_recovery(client):
    login = {"email": "mfa@example.test", "password": "Testing12345"}
    initial = client.post("/auth/login", json=login)
    assert initial.status_code == 200, initial.text
    token = initial.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.get("/auth/mfa", headers=headers).json()["enabled"] is False
    assert client.post("/auth/mfa/setup", headers=headers, json={"password": "wrong"}).status_code == 401
    setup = client.post("/auth/mfa/setup", headers=headers, json={"password": "Testing12345"})
    assert setup.status_code == 200, setup.text
    secret = setup.json()["secret"]; counter = int(time.time() // 30)
    confirm = client.post("/auth/mfa/confirm", headers=headers, json={"code": totp(secret, counter)})
    assert confirm.status_code == 200, confirm.text
    codes = confirm.json()["recovery_codes"]
    assert client.get("/auth/me", headers=headers).status_code == 401
    assert client.post("/auth/login", json=login).status_code == 401
    assert client.post("/auth/login", json={**login, "otp": totp(secret, counter)}).status_code == 401
    valid = client.post("/auth/login", json={**login, "otp": totp(secret, counter + 1)})
    assert valid.status_code == 200, valid.text
    assert decode_token(valid.json()["access_token"]).mfa_verified
    assert client.post("/auth/login", json={**login, "otp": codes[0]}).status_code == 200
    assert client.post("/auth/login", json={**login, "otp": codes[0]}).status_code == 401


def test_missing_encryption_key_does_not_enable_mfa(client, monkeypatch):
    token = client.post("/auth/login", json={"email": "mfa@example.test", "password": "Testing12345"}).json()["access_token"]
    monkeypatch.delenv("TICLASEC_MFA_KEY_FILE")
    monkeypatch.delenv("TICLASEC_MFA_KEY", raising=False)
    response = client.post("/auth/mfa/setup", headers={"Authorization": f"Bearer {token}"}, json={"password": "Testing12345"})
    assert response.status_code == 503


def test_inline_encryption_key_for_managed_deployments(monkeypatch):
    key = Fernet.generate_key()
    monkeypatch.setenv("TICLASEC_MFA_KEY", key.decode())
    monkeypatch.delenv("TICLASEC_MFA_KEY_FILE", raising=False)
    assert cipher().encrypt(b"ready") != b"ready"

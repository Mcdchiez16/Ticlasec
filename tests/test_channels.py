import hashlib
import hmac
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from api.auth import get_current_user, require_password_not_reset_pending
from api.routes.channels import router
from channels.service import accept_message, deliver_reply
from db.models import ChannelConnection, ChannelEvent, Investigation, User
from jobqueue.models import Job


@pytest.fixture
def setup(db_engine, monkeypatch):
    monkeypatch.setenv("WHATSAPP_MODE", "cloud")
    for key, value in {"TELEGRAM_BOT_TOKEN": "test-token", "TELEGRAM_BOT_USERNAME": "test_bot",
        "TELEGRAM_WEBHOOK_SECRET": "test-webhook-secret", "WHATSAPP_ACCESS_TOKEN": "test-wa-token",
        "WHATSAPP_PHONE_NUMBER_ID": "987654", "WHATSAPP_BUSINESS_NUMBER": "260977123456",
        "WHATSAPP_APP_SECRET": "test-app-secret", "WHATSAPP_VERIFY_TOKEN": "test-verify",
        "WHATSAPP_API_VERSION": "v23.0", "TICLASEC_RESEARCH_MODE": "false"}.items():
        monkeypatch.setenv(key, value)
    with Session(db_engine) as session:
        owner = User(email="owner@channels.test", hashed_password="unused", must_reset_password=False)
        other = User(email="other@channels.test", hashed_password="unused", must_reset_password=False)
        session.add_all([owner, other]); session.commit()
        current = SimpleNamespace(user=SimpleNamespace(id=owner.id))
        ids = owner.id, other.id
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: current
    app.dependency_overrides[require_password_not_reset_pending] = lambda: current
    return TestClient(app), current, ids


def link(client, provider="telegram"):
    response = client.post("/channels/link", json={"provider": provider, "consent": True, "model": "gpt-4o-mini"})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    return response.json()["command"].split()[1]


def telegram(client, text, event=1, sender=12345, **extras):
    payload = {"update_id": event, "message": {"from": {"id": sender, "is_bot": False},
        "chat": {"id": sender, "type": "private"}, "text": text, "date": int(time.time()), **extras}}
    return client.post("/channels/webhooks/telegram", json=payload,
                       headers={"X-Telegram-Bot-Api-Secret-Token": "test-webhook-secret"})


def test_auth_consent_and_missing_setup(setup, monkeypatch):
    client, _, _ = setup
    assert client.post("/channels/link", json={"provider": "telegram"}).status_code == 422
    monkeypatch.delenv("TELEGRAM_BOT_TOKEN")
    assert client.get("/channels").json()["items"][0]["configured"] is False
    assert client.post("/channels/link", json={"provider": "telegram", "consent": True}).status_code == 409
    app = FastAPI(); app.include_router(router)
    assert TestClient(app).get("/channels").status_code in {401, 403}


def test_one_time_link_replay_and_private_chat(setup, db_engine):
    client, _, (owner, _) = setup
    code = link(client)
    with Session(db_engine) as session:
        row = session.query(ChannelConnection).one()
        assert row.code_hash == hashlib.sha256(code.encode()).hexdigest()
        assert row.external_id is None
    assert telegram(client, "/start " + code, chat={"id": -1, "type": "group"}).status_code == 200
    assert client.get("/channels").json()["items"][0]["connected"] is False
    assert telegram(client, "/start " + code, event=2).status_code == 200
    telegram(client, "/start " + code, event=2)
    telegram(client, "/start " + code, event=3, sender=999)
    with Session(db_engine) as session:
        row = session.query(ChannelConnection).one()
        assert row.user_id == owner and row.external_id == "12345" and row.code_hash is None
        assert session.query(ChannelEvent).count() == 1
        assert session.query(Job).filter_by(task_type="channel_reply").count() == 1
    body = client.get("/channels").json()
    assert body["items"][0]["identity"] == "••••2345"
    assert "test-token" not in str(body) and code not in str(body)


def test_invalid_transport_and_expired_link(setup, db_engine):
    client, _, _ = setup
    code = link(client)
    assert client.post("/channels/webhooks/telegram", json={}).status_code == 401
    with Session(db_engine) as session:
        session.query(ChannelConnection).update({"code_expires_at": int(time.time()) - 1}); session.commit()
    telegram(client, "/start " + code)
    assert client.get("/channels").json()["items"][0]["connected"] is False


def test_owned_commands_and_investigation_dedup(setup, db_engine, monkeypatch):
    client, _, (owner, other) = setup
    telegram(client, "link " + link(client))
    moment = int(time.time()) + 5
    monkeypatch.setattr("channels.service.time.time", lambda: moment)
    telegram(client, "investigate ransomware actor activity", event=2)
    telegram(client, "investigate ransomware actor activity", event=2)
    with Session(db_engine) as session:
        case = session.query(Investigation).filter_by(user_id=owner).one()
        case_id = str(case.run_id)
        assert case.query == "ransomware actor activity"
        jobs = session.query(Job).filter_by(task_type="investigation").all()
        assert len(jobs) == 1 and jobs[0].payload["model"] == "gpt-4o-mini"
        assert jobs[0].payload["depth"] == "fast"
        foreign = Investigation(user_id=other, query="private case", summary="OTHER ACCOUNT SECRET")
        session.add(foreign); session.commit(); foreign_id = str(foreign.run_id)
    moment += 3
    telegram(client, f"brief {foreign_id}", event=3)
    moment += 3
    telegram(client, f"status {case_id}", event=4)
    with Session(db_engine) as session:
        replies = [j.payload["text"] for j in session.query(Job).filter_by(task_type="channel_reply")]
        assert any("Case not found in your account" in r for r in replies)
        assert any(case_id in r and "pages" in r for r in replies)
        assert not any("OTHER ACCOUNT SECRET" in r for r in replies)


@pytest.mark.asyncio
async def test_disconnect_revokes_queued_reply(setup, db_engine, monkeypatch):
    client, _, _ = setup
    telegram(client, "link " + link(client))
    with Session(db_engine) as session:
        payload = session.query(Job).filter_by(task_type="channel_reply").one().payload
    assert client.delete("/channels/telegram").status_code == 200
    sender = AsyncMock(return_value=True)
    monkeypatch.setattr("channels.service.send_message", sender)
    await deliver_reply(payload)
    sender.assert_not_awaited()


def test_whatsapp_signature_phone_and_verification(setup, db_engine):
    client, _, _ = setup
    assert client.get("/channels/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=12345").text == "12345"
    assert client.get("/channels/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345").status_code == 403
    code = link(client, "whatsapp")
    payload = {"object": "whatsapp_business_account", "entry": [{"changes": [{"field": "messages", "value": {
        "metadata": {"phone_number_id": "987654"}, "messages": [{"id": "wamid.test1", "from": "260977111111",
        "timestamp": str(int(time.time())), "type": "text", "text": {"body": "link " + code}}]}}]}]}
    raw = json.dumps(payload).encode()
    signature = "sha256=" + hmac.new(b"test-app-secret", raw, hashlib.sha256).hexdigest()
    assert client.post("/channels/webhooks/whatsapp", content=raw, headers={"X-Hub-Signature-256": "wrong"}).status_code == 401
    assert client.post("/channels/webhooks/whatsapp", content=raw + b" ", headers={"X-Hub-Signature-256": signature}).status_code == 401
    for _ in range(2):
        assert client.post("/channels/webhooks/whatsapp", content=raw, headers={"X-Hub-Signature-256": signature}).status_code == 200
    with Session(db_engine) as session:
        assert session.query(ChannelEvent).count() == 1
        assert session.query(ChannelConnection).one().external_id == "260977111111"


@pytest.mark.asyncio
async def test_whatsapp_expired_window_never_calls_provider(setup, monkeypatch):
    from channels.providers import send_message
    import aiohttp
    def no_network(*args, **kwargs):
        pytest.fail("Expired-window alert must not call Meta")
    monkeypatch.setattr(aiohttp, "ClientSession", no_network)
    assert not await send_message("whatsapp", "260977111111", "alert", int(time.time()) - 86401)


@pytest.mark.parametrize("blocked", ["inactive", "reset", "research"])
def test_account_and_research_controls(setup, db_engine, monkeypatch, blocked):
    client, _, (owner, _) = setup
    telegram(client, "link " + link(client))
    if blocked == "research":
        monkeypatch.setenv("TICLASEC_RESEARCH_MODE", "true")
    else:
        with Session(db_engine) as session:
            user = session.get(User, owner)
            if blocked == "inactive": user.is_active = False
            else: user.must_reset_password = True
            session.commit()
    moment = int(time.time()) + 5
    monkeypatch.setattr("channels.service.time.time", lambda: moment)
    telegram(client, "investigate ransomware activity", event=2)
    with Session(db_engine) as session:
        assert session.query(Investigation).count() == 0


def test_stale_messages_and_plain_chat_do_not_start_cases(setup, db_engine, monkeypatch):
    client, _, _ = setup
    telegram(client, "link " + link(client))
    moment = int(time.time()) + 5
    monkeypatch.setattr("channels.service.time.time", lambda: moment)
    telegram(client, "hello there", event=2)
    accept_message("telegram", "3", "12345", "investigate ransomware activity", moment - 4000)
    with Session(db_engine) as session:
        assert session.query(Investigation).count() == 0


def test_link_rate_limit_and_other_owner_cannot_disconnect(setup, db_engine):
    client, current, (owner, other) = setup
    code = link(client)
    assert client.post("/channels/link", json={"provider": "telegram", "consent": True}).status_code == 429
    telegram(client, "link " + code)
    current.user.id = other
    assert client.get("/channels").json()["items"][0]["connected"] is False
    client.delete("/channels/telegram")
    with Session(db_engine) as session:
        assert session.query(ChannelConnection).filter_by(user_id=owner).one().external_id == "12345"


@pytest.mark.asyncio
@pytest.mark.parametrize("provider", ["telegram", "whatsapp"])
async def test_provider_delivery_contract(setup, monkeypatch, provider):
    from channels.providers import send_message
    requests = []
    class Response:
        status = 200
        async def json(self):
            return {"ok": True} if provider == "telegram" else {"messages": [{"id": "test"}]}
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        def post(self, url, **kwargs):
            requests.append((url, kwargs)); return Response()
    monkeypatch.setattr("channels.providers.aiohttp.ClientSession", Client)
    assert await send_message(provider, "123456789", "test response", int(time.time()))
    url, request = requests[0]
    assert request["allow_redirects"] is False
    if provider == "telegram":
        assert url.startswith("https://api.telegram.org/bot")
        assert request["json"]["chat_id"] == "123456789"
        assert request["json"]["link_preview_options"]["is_disabled"] is True
    else:
        assert url == "https://graph.facebook.com/v23.0/987654/messages"
        assert request["headers"]["Authorization"] == "Bearer test-wa-token"
        assert request["json"]["text"] == {"body": "test response", "preview_url": False}


def test_owned_brief_is_defanged(setup, db_engine, monkeypatch):
    client, _, (owner, _) = setup
    telegram(client, "link " + link(client))
    with Session(db_engine) as session:
        case = Investigation(user_id=owner, query="case", summary="Source: https://suspicious.example/path [S1]")
        session.add(case); session.commit(); case_id = str(case.run_id)
    moment = int(time.time()) + 5
    monkeypatch.setattr("channels.service.time.time", lambda: moment)
    telegram(client, f"brief {case_id}", event=2)
    with Session(db_engine) as session:
        replies = [row.payload["text"] for row in session.query(Job).filter_by(task_type="channel_reply")]
        assert any("hxxps://suspicious[.]example/path [S1]" in reply for reply in replies)


def test_channel_migration_is_reversible():
    import importlib
    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    migration = importlib.import_module("db.migrations.versions.0039_channels")
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
        original = migration.op
        try:
            migration.op = Operations(MigrationContext.configure(connection))
            migration.upgrade()
            assert {"channel_connections", "channel_events"}.issubset(sa.inspect(connection).get_table_names())
            migration.downgrade()
            assert sa.inspect(connection).get_table_names() == ["users"]
        finally:
            migration.op = original

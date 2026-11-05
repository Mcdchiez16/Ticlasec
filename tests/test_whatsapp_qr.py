import importlib.util
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text, inspect
from sqlalchemy.orm import Session

from api.auth import get_current_user, require_password_not_reset_pending
from api.routes.channels import router
from channels import qr_bridge
from channels.service import accept_message, deliver_reply, send_connected_alert
from db.models import ChannelConnection, ChannelEvent, Investigation, User
from jobqueue.models import Job


@pytest.fixture
def qr_setup(db_engine, monkeypatch, tmp_path):
    monkeypatch.setenv("WHATSAPP_MODE", "qr")
    monkeypatch.setenv("TICLASEC_RESEARCH_MODE", "false")
    secret = tmp_path / "bridge.key"
    secret.write_text("a" * 64)
    monkeypatch.setenv("WHATSAPP_BRIDGE_SECRET_FILE", str(secret))
    bridge = AsyncMock(return_value={"status": "connecting"})
    monkeypatch.setattr(qr_bridge, "call", bridge)
    with Session(db_engine) as session:
        users = [User(email=f"qr-{n}@test.invalid", hashed_password="unused", must_reset_password=False) for n in range(2)]
        session.add_all(users); session.commit()
        ids = [u.id for u in users]
    current = SimpleNamespace(user=SimpleNamespace(id=ids[0]))
    app = FastAPI(); app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: current
    app.dependency_overrides[require_password_not_reset_pending] = lambda: current
    return TestClient(app), current, ids, bridge


def start(client, engine):
    response = client.post("/channels/whatsapp/qr", json={"consent": True, "unofficial_ack": True, "model": "gpt-4o-mini"})
    assert response.status_code == 200, response.text
    assert response.headers["cache-control"] == "no-store"
    with Session(engine) as session:
        return str(session.query(ChannelConnection).one().id)


def event(client, id, kind="connected", account="260977000001", **extra):
    return client.post("/channels/bridge/event", json={"connection_id": id, "event": kind, "account": account, **extra},
                       headers={"Authorization": "Bearer " + "a" * 64})


def test_qr_auth_consent_and_ready_not_connected(qr_setup, db_engine):
    client, _, _, bridge = qr_setup
    assert client.post("/channels/whatsapp/qr", json={"consent": True}).status_code == 422
    app = FastAPI(); app.include_router(router)
    assert TestClient(app).get("/channels/whatsapp/qr").status_code in {401, 403}
    assert TestClient(app).post("/channels/whatsapp/qr", json={"consent": True, "unofficial_ack": True}).status_code in {401, 403}
    start(client, db_engine)
    item = client.get("/channels").json()["items"][1]
    assert item["configured"] and item["connection_mode"] == "qr" and not item["connected"]
    assert item["has_session"]
    assert "qr_data_url" not in str(item) and "a" * 64 not in str(item)
    assert client.post("/channels/link", json={"provider": "whatsapp", "consent": True}).status_code == 409


def test_pairing_qr_and_disconnect_are_owner_scoped(qr_setup, db_engine):
    client, current, (owner, other), bridge = qr_setup
    id = start(client, db_engine)
    bridge.return_value = {"status": "awaiting_scan", "qr_data_url": "data:image/png;base64,VEVTVA=="}
    assert client.get("/channels/whatsapp/qr").json()["qr_data_url"]
    current.user.id = other; bridge.reset_mock()
    assert client.get("/channels/whatsapp/qr").json() == {"status": "disconnected"}
    bridge.assert_not_called()
    client.delete("/channels/whatsapp")
    with Session(db_engine) as session:
        assert str(session.query(ChannelConnection).filter_by(user_id=owner).one().id) == id
        assert session.query(Job).count() == 0
    current.user.id = owner
    assert client.delete("/channels/whatsapp").status_code == 200
    with Session(db_engine) as session:
        assert session.query(ChannelConnection).count() == 0
        assert session.query(Job).filter_by(task_type="whatsapp_revoke").one().payload["connection_id"] == id
    assert event(client, id).status_code == 410


def test_callback_auth_bound_identity_and_live_status(qr_setup, db_engine):
    client, _, _, bridge = qr_setup
    id = start(client, db_engine)
    payload = {"connection_id": id, "event": "connected", "account": "260977000001"}
    assert client.post("/channels/bridge/event", json=payload).status_code == 401
    assert client.post("/channels/bridge/event", json=payload, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert event(client, id).status_code == 200
    bridge.return_value = {"status": "connected"}
    assert client.get("/channels").json()["items"][1]["connected"]
    assert event(client, id, account="260977000002").status_code == 409
    bridge.return_value = {"status": "reconnecting"}
    assert not client.get("/channels").json()["items"][1]["connected"]


def test_same_phone_cannot_link_two_users(qr_setup, db_engine):
    client, current, (owner, other), _ = qr_setup
    first = start(client, db_engine)
    assert event(client, first).status_code == 200
    current.user.id = other
    client.post("/channels/whatsapp/qr", json={"consent": True, "unofficial_ack": True})
    with Session(db_engine) as session:
        second = str(session.query(ChannelConnection).filter_by(user_id=other).one().id)
    assert event(client, second).status_code == 409
    with Session(db_engine) as session:
        assert session.query(ChannelConnection).filter_by(user_id=other).one().external_id is None


def test_commands_idempotent_transport_isolated_and_case_owner_scoped(qr_setup, db_engine):
    client, _, (owner, other), _ = qr_setup
    id = start(client, db_engine); event(client, id)
    now = int(time.time())
    assert event(client, id, "message", event_id="bad", text="cases", sent_at=now).status_code == 422
    # A signed Cloud API webhook is not authorization to access a QR session.
    accept_message("whatsapp", "cloud-event", "260977000001", "investigate ransomware activity", now)
    with Session(db_engine) as session:
        assert session.query(Investigation).count() == 0
        hidden = Investigation(user_id=other, query="private other case", summary="private other briefing", status="completed")
        session.add(hidden); session.commit(); run_id = str(hidden.run_id)
    args = {"event_id": "one", "text": f"brief {run_id}", "sent_at": now, "self_chat": True}
    assert event(client, id, "message", **args).status_code == 200
    event(client, id, "message", **args)
    with Session(db_engine) as session:
        assert session.query(ChannelEvent).count() == 1
        reply = session.query(Job).filter_by(task_type="channel_reply").one().payload["text"]
        assert "not found in your account" in reply and "private other briefing" not in reply
        assert "/ticla" in reply


@pytest.mark.parametrize("state", ["inactive", "reset", "mode"])
def test_callback_rejects_revoked_user_or_mode(qr_setup, db_engine, monkeypatch, state):
    client, _, (owner, _), _ = qr_setup
    id = start(client, db_engine)
    if state == "mode": monkeypatch.setenv("WHATSAPP_MODE", "cloud")
    else:
        with Session(db_engine) as session:
            user = session.get(User, owner)
            if state == "inactive": user.is_active = False
            else: user.must_reset_password = True
            session.commit()
    assert event(client, id, "authorize").status_code == 410


@pytest.mark.asyncio
async def test_qr_delivery_uses_self_transport_and_revocation_cancels_queue(qr_setup, db_engine, monkeypatch):
    client, _, (owner, _), _ = qr_setup
    id = start(client, db_engine); event(client, id)
    send = AsyncMock(return_value=True)
    cloud = AsyncMock()
    monkeypatch.setattr(qr_bridge, "send_self", send)
    monkeypatch.setattr("channels.service.send_message", cloud)
    await deliver_reply({"connection_id": id, "text": "test reply"})
    send.assert_awaited_once_with(id, "test reply"); cloud.assert_not_called()
    assert await send_connected_alert(owner, "whatsapp", "test alert")
    client.delete("/channels/whatsapp"); send.reset_mock()
    await deliver_reply({"connection_id": id, "text": "revoked"})
    send.assert_not_called()


def test_bridge_outage_is_honest_and_retains_retryable_session(qr_setup, db_engine):
    client, _, _, bridge = qr_setup
    bridge.side_effect = qr_bridge.BridgeUnavailable("Service unavailable")
    assert client.post("/channels/whatsapp/qr", json={"consent": True, "unofficial_ack": True}).status_code == 503
    assert client.get("/channels/whatsapp/qr").status_code == 503
    item = client.get("/channels").json()["items"][1]
    assert not item["connected"] and item["connection_status"] == "unavailable" and item["has_session"]


def test_transport_migration_preserves_existing_api_connections():
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    spec = importlib.util.spec_from_file_location("qr_migration", "db/migrations/versions/0040_whatsapp_qr.py")
    migration = importlib.util.module_from_spec(spec); spec.loader.exec_module(migration)
    engine = create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE channel_connections (id TEXT PRIMARY KEY)"))
        connection.execute(text("INSERT INTO channel_connections (id) VALUES ('existing')"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        assert connection.execute(text("SELECT transport FROM channel_connections")).scalar() == "api"
        migration.downgrade()
        assert [column["name"] for column in inspect(connection).get_columns("channel_connections")] == ["id"]
    engine.dispose()

"""Evidence provenance and case-isolated analyst review regression tests."""
import uuid
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from api.auth import CurrentUser, get_current_user, require_password_not_reset_pending
from api.routes.investigation_review import router
from db.models import User, Investigation, Entity, Page, InvestigationEntityLink
from utils.evidence_provenance import entity_evidence, organization_match

TEXT = "The fictional threat actor Lantern Crew claimed it breached Example Water, Zambia."
OTHER = "A separate laboratory bulletin describes Lantern Crew as a threat actor targeting test equipment; no real incident is alleged."
LEAD = {"value": "Lantern Crew", "entity_type": "THREAT_ACTOR", "confidence": .95, "context_snippet": TEXT}


def test_copies_across_domains_do_not_add_independent_support():
    pages = [{"id": str(i), "url": f"https://site{i}.example/report", "text": text}
             for i, text in enumerate([TEXT, TEXT, OTHER])]
    proof = entity_evidence(LEAD, pages)
    assert proof["mention_count"] == 3
    assert proof["duplicate_count"] == 1
    assert proof["unique_passages"] == 2
    assert proof["distinct_origins"] == 2
    assert proof["sources"][1]["duplicate_of"] == "0"
    assert "Not established" in proof["independence"]
    assert organization_match({"name": "Example Water"}, proof["sources"])["level"] == "name_or_domain_match"
    pages[0]["text"] += " Updated claim."
    assert entity_evidence(LEAD, pages)["fingerprint"] != proof["fingerprint"]


@pytest.fixture
def review_case(db_engine):
    with Session(db_engine) as session:
        owner = User(email="reviewer@example.test", hashed_password="unused", is_active=True, must_reset_password=False)
        other = User(email="other@example.test", hashed_password="unused", is_active=True)
        session.add_all([owner, other]); session.flush()
        inv = Investigation(query="Synthetic test case", user_id=owner.id, status="completed", metadata_json={"preserve_me": True, "synthetic": {"scenario": "test"}})
        foreign = Investigation(query="Foreign case", user_id=other.id, status="completed")
        session.add_all([inv, foreign]); session.flush()
        pages = [Page(investigation_id=inv.id, url=f"https://site{i}.example/report", cleaned_text=text)
                 for i, text in enumerate([TEXT, TEXT, OTHER])]
        secret = Page(investigation_id=foreign.id, url="https://foreign.example/private", cleaned_text="FOREIGN-SECRET " + TEXT)
        session.add_all([*pages, secret]); session.flush()
        entity = Entity(investigation_id=inv.id, page_id=pages[0].id, **LEAD)
        shared = Entity(investigation_id=foreign.id, page_id=secret.id, entity_type="THREAT_ACTOR", value="Other Crew", confidence=.99, context_snippet="FOREIGN-SECRET Other Crew threat actor")
        session.add_all([entity, shared]); session.flush()
        session.add(InvestigationEntityLink(investigation_id=inv.id, entity_id=shared.id, page_id=secret.id, confidence=.99, context_snippet="FOREIGN-SECRET linked context"))
        ids = SimpleNamespace(inv=str(inv.id), foreign=str(foreign.id), entity=str(entity.id), shared=str(shared.id), pages=[str(p.id) for p in pages], owner=owner.id)
        session.commit()
    app = FastAPI(); app.include_router(router)
    current = CurrentUser(user=User(id=ids.owner, email="reviewer@example.test", hashed_password="unused"), jti="test")
    app.dependency_overrides[get_current_user] = lambda: current
    app.dependency_overrides[require_password_not_reset_pending] = lambda: current
    with TestClient(app) as client:
        yield client, ids, db_engine


def case_data(client, ids):
    response = client.get(f"/investigations/{ids.inv}/workbench")
    assert response.status_code == 200, response.text
    return response.json()


def payload_for(client, ids, **changes):
    data = case_data(client, ids)
    finding = next(f for f in data["findings"] if f["id"] == ids.entity)
    return {"decision": "accepted", "reason": "Source explicitly records this claim; further validation is needed.",
            "source_ids": [ids.pages[0]], "evidence_fingerprint": finding["provenance"]["fingerprint"],
            "expected_version": data["version"], **changes}


def test_case_owner_and_linked_context_are_isolated(review_case):
    client, ids, _ = review_case
    assert client.get(f"/investigations/{ids.foreign}/workbench").status_code == 404
    assert client.get(f"/investigations/{ids.foreign}/workbench/export").status_code == 404
    assert client.put(f"/investigations/{ids.foreign}/workbench/organization", json={}).status_code == 404
    data = case_data(client, ids)
    assert data["synthetic"] is True
    assert "FOREIGN-SECRET" not in str(data) and "foreign[.]example" not in str(data)
    shared = next(f for f in data["findings"] if f["id"] == ids.shared)
    assert shared["provenance"]["sources"] == [] and not shared["quality"]["usable"]


def test_decision_history_version_and_export(review_case):
    client, ids, engine = review_case
    payload = payload_for(client, ids)
    url = f"/investigations/{ids.inv}/workbench/{ids.entity}/review"
    assert client.post(url, json=payload).status_code == 200
    assert client.post(url, json=payload).status_code == 409
    data = case_data(client, ids)
    assert data["version"] == 1 and len(data["history"]) == 1
    assert data["findings"][0]["review"]["decision"] == "accepted"
    assert data["findings"][0]["review"]["stale"] is False
    exported = client.get(f"/investigations/{ids.inv}/workbench/export")
    assert exported.status_code == 200 and "attachment" in exported.headers["content-disposition"]
    assert exported.json()["history"][0]["reviewer_id"] == ids.owner
    with Session(engine) as session:
        assert session.get(Investigation, uuid.UUID(ids.inv)).metadata_json["preserve_me"] is True
        page = session.get(Page, uuid.UUID(ids.pages[0])); page.cleaned_text += " Correction."
        session.commit()
    assert case_data(client, ids)["findings"][0]["review"]["stale"] is True


def test_invalid_sources_or_changed_evidence_are_rejected(review_case):
    client, ids, _ = review_case
    url = f"/investigations/{ids.inv}/workbench/{ids.entity}/review"
    for changes, status in [({"source_ids": []}, 422), ({"source_ids": [str(uuid.uuid4())]}, 422),
                            ({"reason": "     "}, 422), ({"evidence_fingerprint": "0" * 64}, 409)]:
        assert client.post(url, json=payload_for(client, ids, **changes)).status_code == status


def test_independent_confirmation_requires_distinct_support_and_attestation(review_case):
    client, ids, _ = review_case
    url = f"/investigations/{ids.inv}/workbench/{ids.entity}/review"
    assert client.post(url, json=payload_for(client, ids, source_ids=ids.pages[:2], independent_confirmation=True)).status_code == 422
    finding = next(f for f in case_data(client, ids)["findings"] if f["id"] == ids.entity)
    unique = [s["page_id"] for s in finding["provenance"]["sources"] if not s["duplicate_of"]]
    response = client.post(url, json=payload_for(client, ids, source_ids=unique, independent_confirmation=True))
    assert response.status_code == 200, response.text
    assert response.json()["review"]["independent_confirmation"] is True


def test_organization_focus_is_saved_and_versioned(review_case):
    client, ids, _ = review_case
    url = f"/investigations/{ids.inv}/workbench/organization"
    response = client.put(url, json={"name": "Example Water", "domains": ["example.test", "example.test"], "country": "Zambia", "expected_version": 0})
    assert response.status_code == 200
    assert response.json()["organization"]["domains"] == ["example.test"]
    data = case_data(client, ids)
    assert data["findings"][0]["organization_match"]["level"] == "name_or_domain_match"
    assert client.put(url, json={"name": "Overwrite", "expected_version": 0}).status_code == 409


def test_collection_in_progress_cannot_be_reviewed(review_case):
    client, ids, engine = review_case
    payload = payload_for(client, ids)
    with Session(engine) as session:
        session.get(Investigation, uuid.UUID(ids.inv)).status = "processing"; session.commit()
    assert client.post(f"/investigations/{ids.inv}/workbench/{ids.entity}/review", json=payload).status_code == 409

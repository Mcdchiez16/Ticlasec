"""Case-owned evidence review, organization relevance and audit export."""
from __future__ import annotations

import copy
from datetime import datetime, timezone
import json
from typing import Literal
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import or_, select

from api.auth import CurrentUser, get_current_user, require_password_not_reset_pending
from api.ownership import owned_investigation, require_resource_owner
from db.models import Entity, EntityRelationship, InvestigationEntityLink
from db.session import get_session
from utils.content_safety import entity_value_is_blocked
from utils.defang import defang_text
from utils.evidence_provenance import entity_evidence, organization_match
from utils.lead_quality import ACTOR_TYPES, MALWARE_TYPES, STRUCTURED_TYPES, assess_intelligence_lead

router = APIRouter(prefix="/investigations", tags=["evidence review"], dependencies=[Depends(require_resource_owner)])
REVIEW_TYPES = ACTOR_TYPES | MALWARE_TYPES | STRUCTURED_TYPES | {"MITRE_TECHNIQUE", "ORGANIZATION_NAME"}


def _meta(inv) -> dict:
    metadata = inv.metadata_json or {}
    if isinstance(metadata, str):
        metadata = json.loads(metadata)
    return copy.deepcopy(metadata) if isinstance(metadata, dict) else {}


def _iso(value):
    return value.isoformat() if value else None


def build_case_review(session, inv) -> dict:
    from api.routes.investigations import _pages_for_investigation

    metadata = _meta(inv)
    state = metadata.get("analyst_workbench") or {}
    pages = [{"id": str(p.id), "url": p.url, "text": p.cleaned_text or "",
              "collected_at": _iso(p.scrape_timestamp), "published_at": _iso(p.posted_at)}
             for p in _pages_for_investigation(session, inv)]
    links = session.query(InvestigationEntityLink).filter(
        InvestigationEntityLink.investigation_id == inv.id).all()
    by_entity = {str(link.entity_id): link for link in links}
    linked_ids = select(InvestigationEntityLink.entity_id).where(
        InvestigationEntityLink.investigation_id == inv.id)
    entities = session.query(Entity).filter(
        or_(Entity.investigation_id == inv.id, Entity.id.in_(linked_ids)),
        Entity.entity_type.in_(REVIEW_TYPES),
    ).order_by(Entity.id).all()
    records = []
    decisions = state.get("decisions") or {}
    page_ids = {p["id"] for p in pages}
    for entity in entities:
        if entity_value_is_blocked(entity.entity_type, entity.value):
            continue
        link = by_entity.get(str(entity.id))
        context = link.context_snippet if link else entity.context_snippet
        page_id = link.page_id if link else entity.page_id
        # Never use another investigation's canonical context for a linked entity.
        if str(page_id) not in page_ids:
            context = ""
        raw = {"entity_type": entity.entity_type, "value": entity.value,
               "confidence": (link.confidence if link else entity.confidence) or 0,
               "context_snippet": context or ""}
        provenance = entity_evidence(raw, pages)
        quality = assess_intelligence_lead(raw)
        decision = copy.deepcopy(decisions.get(str(entity.id)))
        if decision:
            decision["stale"] = decision.get("evidence_fingerprint") != provenance["fingerprint"]
        organization = organization_match(state.get("organization") or {}, provenance["sources"])
        for source in provenance["sources"]:
            source["url"] = defang_text(source["url"])
            source["excerpt"] = defang_text(source["excerpt"])
        quality["evidence_excerpt"] = defang_text(quality["evidence_excerpt"])
        records.append({"id": str(entity.id), "value": defang_text(entity.value),
                        "entity_type": entity.entity_type, "quality": quality,
                        "provenance": provenance, "review": decision,
                        "organization_match": organization})
    records.sort(key=lambda r: (r["organization_match"]["level"] == "name_or_domain_match",
                                r["quality"]["usable"], r["quality"]["score"]), reverse=True)
    visible_ids = {r["id"] for r in records}
    relationships = session.query(EntityRelationship).filter(
        EntityRelationship.investigation_id == inv.id).all()
    edges = [{"id": str(e.id), "source": str(e.entity_a_id), "target": str(e.entity_b_id),
              "type": e.relationship_type,
              "page_id": str(e.source_page_id) if str(e.source_page_id) in page_ids else None,
              "interpretation": "Co-occurrence only" if e.relationship_type in {"CO_INVESTIGATION", "CO_APPEARED_ON"}
              else "Extracted relationship; verify the source passage"}
             for e in relationships if str(e.entity_a_id) in visible_ids and str(e.entity_b_id) in visible_ids]
    return {"schema_version": "1.0", "investigation_id": str(inv.id), "query": inv.query,
            "status": inv.status, "model": inv.model_used,
            "synthetic": bool(metadata.get("synthetic_scenario") or metadata.get("synthetic")),
            "version": state.get("version", 0), "organization": state.get("organization") or {},
            "findings": records, "relationships": edges, "history": state.get("history") or [],
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "limitations": "Source dates may be unknown. Automated scores are heuristics, not probabilities. Different origins do not prove independence. Analyst acceptance is a review decision, not proof of an attack."}


class OrganizationRequest(BaseModel):
    name: str = Field(default="", max_length=120)
    domains: list[str] = Field(default_factory=list, max_length=20)
    sector: str = Field(default="", max_length=80)
    country: str = Field(default="", max_length=80)
    expected_version: int = Field(ge=0)

    @field_validator("domains")
    @classmethod
    def validate_domains(cls, values):
        if any(len(value) > 253 for value in values):
            raise ValueError("Each domain must be at most 253 characters")
        return list(dict.fromkeys(v.strip().lower() for v in values if v.strip()))


class ReviewRequest(BaseModel):
    decision: Literal["accepted", "rejected", "needs_review"]
    reason: str = Field(min_length=5, max_length=2000)
    next_action: str = Field(default="", max_length=1000)
    assigned_to: str = Field(default="", max_length=120)
    source_ids: list[uuid.UUID] = Field(default_factory=list, max_length=30)
    independent_confirmation: bool = False
    evidence_fingerprint: str = Field(min_length=64, max_length=64)
    expected_version: int = Field(ge=0)

    @field_validator("reason")
    @classmethod
    def clean_reason(cls, value):
        if len(value.strip()) < 5:
            raise ValueError("Explain the review decision in at least five characters")
        return value.strip()


def _lock_state(session, inv, expected_version):
    session.refresh(inv, with_for_update=True)
    if inv.status in {"pending", "processing", "running"}:
        raise HTTPException(409, "Wait for evidence collection to finish before saving a review")
    metadata = _meta(inv)
    state = metadata.setdefault("analyst_workbench", {})
    if state.get("version", 0) != expected_version:
        raise HTTPException(409, "This case was updated. Reload it before saving your decision.")
    if len(state.get("history", [])) >= 2000:
        raise HTTPException(409, "The case review-history limit has been reached; export this case before continuing.")
    return metadata, state


@router.get("/{investigation_id}/workbench")
def read_workbench(investigation_id: str, current: CurrentUser = Depends(get_current_user)):
    with get_session() as session:
        inv = owned_investigation(session, investigation_id, current.user.id)
        return build_case_review(session, inv)


@router.put("/{investigation_id}/workbench/organization")
def save_organization(investigation_id: str, body: OrganizationRequest,
                      current: CurrentUser = Depends(require_password_not_reset_pending)):
    with get_session() as session:
        inv = owned_investigation(session, investigation_id, current.user.id)
        metadata, state = _lock_state(session, inv, body.expected_version)
        organization = body.model_dump(exclude={"expected_version"})
        state["organization"] = organization
        state["version"] = body.expected_version + 1
        state.setdefault("history", []).append({"kind": "organization_updated", "organization": organization,
            "at": datetime.now(timezone.utc).isoformat(), "reviewer_id": current.user.id})
        inv.metadata_json = metadata
        return {"version": state["version"], "organization": organization}


@router.post("/{investigation_id}/workbench/{entity_id}/review")
def save_review(investigation_id: str, entity_id: uuid.UUID, body: ReviewRequest,
                current: CurrentUser = Depends(require_password_not_reset_pending)):
    with get_session() as session:
        inv = owned_investigation(session, investigation_id, current.user.id)
        # Build evidence before acquiring a write lock. Completed case pages
        # are immutable through this API; optimistic versioning protects edits.
        case = build_case_review(session, inv)
        finding = next((f for f in case["findings"] if f["id"] == str(entity_id)), None)
        if finding is None:
            raise HTTPException(404, "Finding not found in this investigation")
        provenance = finding["provenance"]
        if body.evidence_fingerprint != provenance["fingerprint"]:
            raise HTTPException(409, "The evidence changed. Reload and review the latest passages.")
        selected_ids = {str(s) for s in body.source_ids}
        available = {s["page_id"]: s for s in provenance["sources"]}
        if not selected_ids.issubset(available):
            raise HTTPException(422, "Selected evidence must belong to this finding")
        if body.decision == "accepted" and not selected_ids:
            raise HTTPException(422, "Select at least one supporting passage to accept a finding")
        if body.independent_confirmation:
            selected = [available[s] for s in selected_ids]
            if (body.decision != "accepted" or len(selected) < 2
                or any(s["duplicate_of"] or not s["supports_role"] or not s["origin"] for s in selected)
                or len({s["origin"] for s in selected}) < 2):
                raise HTTPException(422, "Independent confirmation needs two non-duplicate supporting passages from different origins and an accepted decision")
        metadata, state = _lock_state(session, inv, body.expected_version)
        decision = body.model_dump(mode="json", exclude={"expected_version"})
        decision.update(at=datetime.now(timezone.utc).isoformat(), reviewer_id=current.user.id)
        state.setdefault("decisions", {})[str(entity_id)] = decision
        state.setdefault("history", []).append({"kind": "finding_reviewed", "entity_id": str(entity_id), **decision})
        state["version"] = body.expected_version + 1
        inv.metadata_json = metadata
        return {"version": state["version"], "review": decision}


@router.get("/{investigation_id}/workbench/export")
def export_workbench(investigation_id: str, current: CurrentUser = Depends(get_current_user)):
    with get_session() as session:
        inv = owned_investigation(session, investigation_id, current.user.id)
        report = build_case_review(session, inv)
    return Response(json.dumps(report, indent=2), media_type="application/json", headers={
        "Content-Disposition": f'attachment; filename="ticlasec-case-{report["investigation_id"]}.json"',
        "Cache-Control": "no-store",
    })

"""Label Studio interchange for separate, blinded B/C projects.

Exports never contain predictions, gold, other annotators' work or source URLs.
Role permissions are configured in Label Studio, not inferred from this file.
"""
from __future__ import annotations

import secrets

from research_evaluation.protocol import CATEGORIES, ENTITY_LABELS, RELEVANCE, Annotation, Study, canonical_hash


def label_config() -> str:
    entities = "".join(f'<Label value="{v}"/>' for v in ENTITY_LABELS)
    categories = "".join(f'<Choice value="{v}"/>' for v in CATEGORIES)
    relevance = "".join(f'<Choice value="{v}"/>' for v in RELEVANCE)
    return f'''<View>
  <Header value="Label only the supplied sanitized text. Do not follow indicators."/>
  <Text name="text" value="$text"/>
  <Labels name="entities" toName="text">{entities}</Labels>
  <Choices name="threat_category" toName="text" choice="single" required="true">{categories}</Choices>
  <Choices name="scope_relevance" toName="text" choice="single" required="true">{relevance}</Choices>
  <TextArea name="summary" toName="text" required="true" rows="4" placeholder="Your independent summary, at most 80 words"/>
  <TextArea name="active_seconds" toName="text" required="true" placeholder="Measured active working seconds, excluding breaks"/>
</View>'''


def annotation_tasks(study: Study, split: str) -> list[dict]:
    if split not in {"practice", "benchmark"}:
        raise ValueError("Choose practice or benchmark")
    return [{"data": {"document_id": d.id, "content_sha256": d.content_sha256, "text": d.text}}
            for d in study.documents if d.split == split]


def _unicode_offset(text: str, offset: int) -> int:
    """Label Studio/browser offsets are UTF-16; benchmark offsets are Unicode."""
    if type(offset) is not int or offset < 0:
        raise ValueError("Invalid UTF-16 span offset")
    encoded = text.encode("utf-16-le")
    if offset * 2 > len(encoded):
        raise ValueError("UTF-16 span is outside the document")
    try:
        return len(encoded[:offset * 2].decode("utf-16-le"))
    except UnicodeDecodeError as exc:
        raise ValueError("Span splits a Unicode surrogate pair") from exc


def import_annotations(study: Study, tasks: list[dict], role: str, label_studio_user_id: str) -> Study:
    if role not in {"B", "C"}:
        raise ValueError("Import the independently completed B or C project")
    if study.frozen_gold_sha256:
        raise ValueError("Frozen studies cannot accept changed annotations")
    result = study.model_copy(deep=True)
    docs = {d.id: d for d in result.documents}
    seen = set()
    for task in tasks:
        data = task.get("data", {})
        doc_id = data.get("document_id")
        if doc_id not in docs or doc_id in seen:
            raise ValueError("Unknown or duplicate document in Label Studio export")
        seen.add(doc_id)
        doc = docs[doc_id]
        if data.get("content_sha256") != doc.content_sha256 or data.get("text") != doc.text:
            raise ValueError("Label Studio document text/hash changed")
        if role in doc.annotations:
            raise ValueError("Existing independent annotations cannot be silently overwritten")
        annotations = [a for a in task.get("annotations", []) if not a.get("was_cancelled")]
        if len(annotations) != 1:
            raise ValueError("Export exactly one completed independent annotation per task")
        source = annotations[0]
        who = source.get("completed_by")
        who = who.get("id") if isinstance(who, dict) else who
        if str(who) != label_studio_user_id:
            raise ValueError("Label Studio completed_by does not match the assigned annotator account")
        labels: dict = {"entities": [], "annotator_id": getattr(study.participants, role), "completed_at": source.get("updated_at") or source.get("created_at")}
        for item in source.get("result", []):
            name, value = item.get("from_name"), item.get("value", {})
            if name == "entities":
                if len(value.get("labels", [])) != 1:
                    raise ValueError("Each entity requires exactly one proposal label")
                start, end = _unicode_offset(doc.text, value["start"]), _unicode_offset(doc.text, value["end"])
                labels["entities"].append({"type": value["labels"][0], "start": start, "end": end, "text": value["text"]})
            elif name in {"threat_category", "scope_relevance", "summary", "active_seconds"}:
                if name in labels:
                    raise ValueError("Duplicate document annotation field")
                values = value.get("choices" if name in {"threat_category", "scope_relevance"} else "text", [])
                if len(values) != 1:
                    raise ValueError("Each document field needs exactly one value")
                labels[name] = values[0]
        doc.annotations[role] = Annotation.model_validate(labels)
    # Run all exact-span and cross-record checks after import.
    return Study.model_validate(result.model_dump())


def blinded_summary_pack(study: Study) -> dict:
    """Return public rater packets separately from a supervisor-only key.

    Random opaque IDs hide provenance; the key must NOT be given to raters.
    Persist this generated assignment once and retain its hash.
    """
    if not study.frozen_gold_sha256:
        raise ValueError("Freeze the adjudicated gold before preparing ratings")
    from research_evaluation.protocol import gold_hash
    if study.frozen_gold_sha256 != gold_hash(study):
        raise ValueError("Frozen gold changed")
    packets, key = {}, {}
    for role in ("A", "B", "C"):
        items = []
        for d in study.documents:
            if d.split != "benchmark":
                continue
            if not d.gold or not d.prediction:
                raise ValueError("Every benchmark document needs gold and model summaries")
            for kind, labels in (("reference", d.gold), ("model", d.prediction)):
                blind_id = secrets.token_hex(12)
                items.append({"blind_id": blind_id, "document_id": d.id, "text": d.text, "summary": labels.summary})
                key[blind_id] = {"role": role, "document_id": d.id, "kind": kind}
        secrets.SystemRandom().shuffle(items)
        packets[role] = items
    return {"study_id": study.study_id, "gold_sha256": study.frozen_gold_sha256,
            "rater_packets": packets, "supervisor_only_key": key, "assignment_sha256": canonical_hash(key),
            "warning": "Distribute each rater's packet only. Keep the allocation key private. Do not regenerate assignments after ratings begin."}

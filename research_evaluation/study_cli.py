"""Offline study tooling. Run: python -m research_evaluation.study_cli --help.

Never overwrites an artifact. Study files are encrypted with a separate Fernet
key; only deliberate annotation exports contain sanitized plaintext.
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import json
import os
from pathlib import Path

from cryptography.fernet import Fernet

from research_evaluation.annotation import annotation_tasks, blinded_summary_pack, import_annotations, label_config
from research_evaluation.protocol import Document, Study, audit_study, empty_study, gold_hash
from research_evaluation.safety import prepare_text


def write_new(path: str, data: bytes) -> None:
    # Exclusive create: old baseline, gold and run artifacts remain intact.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "wb") as out:
        out.write(data)


def dump(value) -> bytes:
    return json.dumps(value, indent=2, ensure_ascii=False).encode()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["keygen", "template", "prepare", "audit", "freeze", "export", "export-study", "export-rater", "import", "review", "blind", "predict", "apply-run", "restore-check"])
    parser.add_argument("--input", help="Encrypted study file (JSON only for template preparation)")
    parser.add_argument("--output", required=True, help="New artifact path; existing files are never overwritten")
    parser.add_argument("--key-file", help="External Fernet key; never commit or include in backups")
    parser.add_argument("--documents", help="JSON documents for preparation, with text, source_class, source_reference, id and split")
    parser.add_argument("--reviewer", help="Person responsible for checking the sanitized output")
    parser.add_argument("--annotations", help="Label Studio export or encrypted run result")
    parser.add_argument("--role", choices=["B", "C"])
    parser.add_argument("--rater", choices=["A", "B", "C"], help="Export only this rater's blinded packet, never the allocation key")
    parser.add_argument("--account", help="Assigned Label Studio completed_by user ID")
    parser.add_argument("--split", choices=["practice", "benchmark"], default="practice")
    parser.add_argument("--model", default="gpt-5.6-luna", help="Exact model; no automatic fallback")
    parser.add_argument("--allow-external-api", action="store_true", help="Explicitly authorize transmission of reviewed sanitized benchmark to OpenAI")
    parser.add_argument("--revision", type=int, choices=[0, 1], default=0)
    parser.add_argument("--previous-run", help="Encrypted original run for one documented revision")
    parser.add_argument("--revision-reason", default="")
    args = parser.parse_args(argv)
    try:
        if args.command == "keygen":
            write_new(args.output, Fernet.generate_key())
            return 0
        if args.command == "template":
            write_new(args.output, dump(empty_study()))
            return 0
        if not args.key_file or not args.input:
            raise ValueError("--key-file and --input are required")
        key = Path(args.key_file).read_bytes().strip()
        cipher = Fernet(key)
        raw = Path(args.input).read_bytes()
        if args.command == "export-rater":
            if not args.rater:
                raise ValueError("Choose --rater A, B or C")
            allocation = json.loads(cipher.decrypt(raw))
            # Deliberately export only the selected list, not sibling packets or
            # the supervisor key bundled in the encrypted allocation artifact.
            packet = allocation["rater_packets"][args.rater]
            write_new(args.output, dump(packet))
            return 0
        study = Study.model_validate_json(raw if args.command == "prepare" else cipher.decrypt(raw))
        if args.command == "prepare":
            if not args.documents or not args.reviewer:
                raise ValueError("--documents and --reviewer are required; manually inspect the prepared text before annotation/API")
            if study.documents:
                raise ValueError("Prepare into an empty study template; never change annotated text")
            sources = json.loads(Path(args.documents).read_text())
            if not isinstance(sources, list) or len(sources) > 55:
                raise ValueError("Supply at most 55 text document objects")
            for row in sources:
                text, info = prepare_text(row["text"], key)
                study.documents.append(Document(id=row["id"], text=text, content_sha256=info["content_sha256"],
                    source_class=row["source_class"], source_reference=row["source_reference"], split=row["split"], sanitized_by=args.reviewer))
            study = Study.model_validate(study.model_dump())
            write_new(args.output, cipher.encrypt(dump(study.model_dump(mode="json"))))
        elif args.command == "audit":
            write_new(args.output, dump(audit_study(study)))
        elif args.command == "restore-check":
            # Decrypt and validate without ever writing the plaintext dataset.
            write_new(args.output, dump({"decryption": "passed", "schema": "passed", "documents": len(study.documents),
                "gold_sha256": gold_hash(study), "checked_at": datetime.now(timezone.utc).isoformat(),
                "notice": "Artifact recovery only; this is not proof of restoring PostgreSQL, index, VM or external cloud backup."}))
        elif args.command == "freeze":
            checks = {c["id"]: c["status"] for c in audit_study(study)["checks"]}
            if study.frozen_gold_sha256 or any(checks[k] != "met" for k in ("corpus", "practice", "independent_annotations", "training_before_benchmark", "adjudication")):
                raise ValueError("Freeze once, only after corpus, practice, independent annotation and adjudication checks pass")
            if any(d.prediction for d in study.documents):
                raise ValueError("Do not freeze gold after viewing predictions")
            study.frozen_gold_sha256, study.frozen_at = gold_hash(study), datetime.now(timezone.utc)
            write_new(args.output, cipher.encrypt(dump(study.model_dump(mode="json"))))
        elif args.command == "export":
            write_new(args.output, dump({"label_config": label_config(), "tasks": annotation_tasks(study, args.split),
                "notice": "Import tasks into separate B/C projects; configure account isolation, LAN-only access and no export rights. Sanitized plaintext: store only in the approved lab."}))
        elif args.command == "export-study":
            # Explicit supervisor/researcher export only, never an annotator packet.
            write_new(args.output, dump(study.model_dump(mode="json")))
        elif args.command == "review":
            if not args.annotations:
                raise ValueError("Provide a supervisor review JSON file with --annotations")
            review = json.loads(Path(args.annotations).read_text())
            if set(review) - {"documents", "evidence", "training_minutes"}:
                raise ValueError("Review accepts only documents, evidence and training_minutes")
            data = study.model_dump(mode="json")
            if "evidence" in review:
                data["evidence"].update(review["evidence"])
            if "training_minutes" in review:
                data["training_minutes"] = review["training_minutes"]
            by_id = {d["id"]: d for d in data["documents"]}
            for doc_id, patch in review.get("documents", {}).items():
                allowed = {"summary_ratings", "reference_ratings"} if study.frozen_gold_sha256 else {"gold", "adjudication"}
                if doc_id not in by_id or set(patch) - allowed:
                    raise ValueError("Only supervisor gold/adjudication before freeze, or ratings after freeze, may change")
                by_id[doc_id].update(patch)
            changed = Study.model_validate(data)
            write_new(args.output, cipher.encrypt(dump(changed.model_dump(mode="json"))))
        elif args.command == "import":
            if not args.annotations or not args.role or not args.account:
                raise ValueError("Provide --annotations, --role and --account")
            tasks = json.loads(Path(args.annotations).read_text())
            changed = import_annotations(study, tasks, args.role, args.account)
            write_new(args.output, cipher.encrypt(dump(changed.model_dump(mode="json"))))
        elif args.command == "blind":
            write_new(args.output, cipher.encrypt(dump(blinded_summary_pack(study))))
        elif args.command == "apply-run":
            if not args.annotations:
                raise ValueError("Provide the encrypted measured run with --annotations")
            run = json.loads(cipher.decrypt(Path(args.annotations).read_bytes()))
            if run.get("gold_sha256") != study.frozen_gold_sha256 or gold_hash(study) != study.frozen_gold_sha256:
                raise ValueError("Run and study frozen gold differ")
            if any(d.prediction or d.summary_ratings or d.reference_ratings for d in study.documents):
                raise ValueError("Apply a run to the original frozen study, not a previously predicted or rated study")
            by_id = {d.id: d for d in study.documents}
            seen = set()
            for result in run["results"]:
                manifest = result["manifest"]
                doc = by_id[manifest["document_id"]]
                if doc.id in seen or doc.content_sha256 != manifest["content_sha256"]:
                    raise ValueError("Run contains duplicate or changed documents")
                seen.add(doc.id)
                if result["prediction"]:
                    from research_evaluation.protocol import Labels
                    doc.prediction = Labels.model_validate(result["prediction"])
                    doc.pipeline_seconds = manifest["wall_seconds"]
            changed = Study.model_validate(study.model_dump())
            write_new(args.output, cipher.encrypt(dump(changed.model_dump(mode="json"))))
        elif args.command == "predict":
            if not args.allow_external_api:
                raise ValueError("Explicit --allow-external-api authorization is required; no request sent")
            for requirement in ("ethics_clearance", "supervisor_protocol", "model_access"):
                if requirement not in study.evidence:
                    raise ValueError("Record signed approvals and verified model access before external processing")
            if not os.getenv("OPENAI_API_KEY"):
                raise ValueError("OPENAI_API_KEY is not configured")
            from openai import AsyncOpenAI
            from research_evaluation.runner import run_study
            previous = json.loads(cipher.decrypt(Path(args.previous_run).read_bytes())) if args.previous_run else None
            async def run():
                # Fixed official endpoint, TLS, no implicit retries or tools.
                async with AsyncOpenAI(api_key=os.environ["OPENAI_API_KEY"], base_url="https://api.openai.com/v1", timeout=60, max_retries=0) as client:
                    return await run_study(client, args.model, study, "https://api.openai.com/v1", args.revision, previous, args.revision_reason)
            write_new(args.output, cipher.encrypt(dump(asyncio.run(run()))))
        return 0
    except Exception as exc:
        # Avoid echoing document values from Pydantic or provider exceptions.
        print(f"Operation stopped ({type(exc).__name__}). No existing artifact was overwritten.")
        if type(exc) is ValueError:
            print(str(exc))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

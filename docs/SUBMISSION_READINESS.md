# Proposal alignment and submission readiness

This is an implementation and evidence checklist, **not a declaration that the
dissertation is ready to submit**. The governing document is the supplied
`Proposal.docx`, especially §§1.4, 1.6, 3.2.5, 3.3.6–3.3.7 and 3.4.1.
Its appendices contain proposed forms, not evidence of signed approval.

Open `/research` in the application for the requirements, MFA enrollment,
Label Studio configuration and strict study audit. `/evaluation` remains an
exploratory scorer and developer demonstration; its results alone do not satisfy
the proposal. No developer test fixture is part of the formal human benchmark.

## What is implemented, and what is still outstanding

| Proposal commitment | Implementation / evidence | Remaining requirement |
| --- | --- | --- |
| Zambia-focused research; global product may coexist | Strict study schema accepts Zambia only; global product scopes remain | Record the distinction in the dissertation |
| Secure collection from ≥5 individually approved sources | Existing Tor collector; research mode pauses collection and background workers | Written ethics clearance, five source approvals, a dedicated verified allowlisted collector with persistent 200/source/week quotas, daily throttling, no link traversal and stop-on-error. Existing unrestricted search is **not** this controlled collector |
| Exact 50-document pilot and separate practice set | Composition, word limits, IDs, SHA-256, uniqueness and exact span validation | Assemble 20 synthetic +30 authorized archived documents, or approved 20/20/10 variant, plus five practice documents. 8,050 is a budget ceiling, not a target |
| Independent B/C annotation, supervisor adjudication | Label Studio configuration and separate blinded exports; identity/hash checks on import; four distinct participant identifiers | Recruit eligible participants, consent, training and separate restricted lab accounts; actually annotate and adjudicate |
| Agreement before adjudication | Cohen's kappa for category/relevance; exact and partial span F1; undefined kappa never passes | Complete practice, category kappa ≥0.70, and report all main-set agreement |
| Frozen gold and one revision | Gold hash, exclusive artifact creation, original-run linkage and one revision counter | Supervisor freeze before outputs; retain initial and revised artifacts. Files can be edited by their owner, so hashes do not authenticate provenance |
| One pinned model for relevance, category and ≤80-word summary | Explicit research runner, fixed schema, exact source quotes/spans, no tools, no automatic model fallback, storage disabled, failure/token/runtime manifests | Reproduce account-level access test, verify requested/returned identifier and pricing, obtain transfer approval, then measure. The new runner combines tasks into one structured call: document this implementation detail |
| Neural CTI extraction methodology | Existing product uses regex, dictionaries, spaCy and optional LLM; research runner uses schema-constrained LLM spans | **Not equivalent to a trained CTI neural sequence tagger.** Implement/evaluate the proposed method, or obtain and report a supervisor-approved methodological amendment |
| Manual comparison and usefulness | Fixed proposal metrics, B/C identity/timing requirements, three distinct raters, blinded summary packet generator, manual F1 percentage difference | Actual independent manual times, predictions, and A/B/C ratings of both generated and reference summaries; developer-authored scores cannot substitute |
| Redaction and safe display | Local fail-closed preparation, keyed pseudonyms, secret/phone/NRC/card/PERSON masking, defanging before annotation/hashing/API | Human redaction review and injection tests on real sanitized material. Automatic NER cannot guarantee removal of all personal data |
| Encryption and MFA | Encrypted research artifacts; external MFA encryption key; encrypted TOTP factors, replay protection, hashed one-use recovery codes | Enroll each required account; verify isolated encrypted VM, external key custody, firewall/SSH and deployment permissions. Legacy database/index contents are **not retroactively encrypted or sanitized** |
| Backups, retention, access audit | Non-overwriting encrypted artifacts and decrypt/validate restore check; existing investigation review history | Nightly encrypted drive/cloud backups, whole-system monthly restore test, complete access audit, participant access expiry, approved retention schedule and verified deletion within 30 days of final exam |

The 20+30 archived fallback permits the pilot without live collection. It does
not demonstrate Objective 1's live five-source requirement. Report that objective
as deferred or obtain an explicit supervisor-approved scope revision.

## Optional research preparation mode

Docker defaults to normal product mode (`TICLASEC_RESEARCH_MODE=false`). The
readiness checklist remains available separately and does not block normal
investigation processing. To explicitly pause the product for study preparation,
set `TICLASEC_RESEARCH_MODE=true` and recreate the backend container. In that mode:

- Existing cases can be read. New live investigations, legacy AI actions,
  search/debug network routes and monitoring triggers return a clear 423 message.
- Queue workers, monitoring scheduler, freshness bootstrap and browser prewarm
  are paused. Queued work and existing records are preserved, not deleted.
- The evaluation workspaces, settings and authentication remain accessible.
- The measured study runner is an explicit offline-command workflow; it cannot
  be triggered by an annotator's document or an AI-generated tool call.

This is application-level containment, not an egress firewall. CLI scripts,
unrelated processes and Tor itself require VM/network controls. Do not describe
turning off the flag as approval. Product mode can still be configured separately
for properly authorized use; the current collector must not be labelled a
proposal-compliant live-study collector merely because it works.

## MFA enrollment

Open **Research readiness → Protect your account**. Enter your current password,
add the displayed setup key to a TOTP authenticator, then confirm its code.
Save the eight one-use recovery codes offline; they are shown once. Sign in
again with the next 30-second code. Existing password-only sessions are rejected
after enrollment. Replay of a consumed time-step code is rejected, including
the enrollment code. Unenrolled legacy accounts are not silently treated as MFA
verified. Enroll researcher and supervisor separately.

The Docker mount reads `../.research-secrets/mfa.key` from outside the repository.
Keep this file private and back it up under separate key custody. Do not rotate
or delete it without a migration/recovery plan: losing it prevents TOTP
verification. Key unavailability fails authentication closed. Recovery codes
remain individually one-use. No unauthenticated MFA-disable endpoint is provided.
Rotate API credentials that have been shared in chat or screenshots; do not
include credentials or MFA secrets in the submission package.

## Offline study procedure

Run inside the approved research environment with the project's dependencies.
Use a private working directory on encrypted storage, outside the repository.
Commands below use illustrative relative filenames; no real participants,
approvals, labels, ratings or results are supplied by the software.

```sh
python -m research_evaluation.study_cli --help
python -m research_evaluation.study_cli keygen --output study.key
python -m research_evaluation.study_cli template --output study-template.json
```

Put the four actual pseudonymous participant IDs in the template. Prepare an
authorized local `documents.json` array whose entries have `id`, `text`, `split`
(`practice` or `benchmark`), `source_class` (`synthetic`, `archived`, or
`approved_live`) and `source_reference`. Source references describe provenance;
do not include live credentials or private access links. Raw documents must never
be imported into the web audit. Keep the key separate from exported data/backups.

```sh
python -m research_evaluation.study_cli prepare --input study-template.json --documents documents.json --reviewer researcher-A --key-file study.key --output prepared.enc
python -m research_evaluation.study_cli export --input prepared.enc --key-file study.key --split practice --output practice-export.json
```

Preparation runs local redaction and defanging before hashing/encryption. It
fails if the PERSON recognizer is unavailable. It does not mean a human review
has occurred: the named reviewer must inspect the sanitized tasks and correct
issues **before** annotation. Corrections require new hashes and fresh tasks.
Repeated pseudonyms use a keyed HMAC; do not disclose the key to annotators.
Plaintext exports are deliberate and must stay in the authorized lab.

The export includes XML under `label_config` and the task array under `tasks`.
Import those tasks into **separate B and C Label Studio projects**, with separate
accounts, LAN-only access, no prediction preload, no other annotator's labels,
no admin/export privileges, and access expiry. Confirm these permissions using
the actual deployed Label Studio edition; generating XML does not configure
permissions or establish blinding. Do not give annotators product accounts,
database access, a Tor client, study keys or the full study export.

```sh
python -m research_evaluation.study_cli import --input prepared.enc --key-file study.key --annotations B-export.json --role B --account 11 --output with-B.enc
python -m research_evaluation.study_cli import --input with-B.enc --key-file study.key --annotations C-export.json --role C --account 12 --output with-BC.enc
python -m research_evaluation.study_cli audit --input with-BC.enc --key-file study.key --output practice-audit.json
```

`--account` is the actual Label Studio `completed_by` identifier, not a participant
role invented for convenience. Imports verify IDs, exact text/hash, account,
Unicode offsets, label enums and active time; existing labels cannot be silently
overwritten. Browser UTF-16 offsets are converted to Unicode character indexes.
The annotator enters measured active seconds excluding breaks; elapsed browser
session time is not falsely described as active work.

After a minimum one-hour training and passing practice agreement, export/import
the benchmark split in the same way. Keep manual work blinded to predictions.
The supervisor prepares a review JSON with these optional top-level keys:

- `training_minutes`: actual training duration.
- `evidence`: references keyed by the IDs listed on `/research`, each containing
  `reference`, file `sha256`, `reviewed_by`, and timezone-aware `reviewed_at`.
  These fields record a review; they do not authenticate a signature.
- `documents`: mapping document IDs to `gold` and `adjudication`. Gold includes
  all exact spans, category, Zambia relevance and A's checked ≤80-word reference
  summary. Adjudication includes `supervisor_id`, `guide_rule`, `completed_at`.

```sh
python -m research_evaluation.study_cli review --input with-BC.enc --key-file study.key --annotations supervisor-review.json --output adjudicated.enc
python -m research_evaluation.study_cli freeze --input adjudicated.enc --key-file study.key --output frozen.enc
```

Freeze requires the full corpus, practice agreement, B/C annotations and
supervisor decisions. It rejects an already frozen dataset or prior predictions.
The command refuses to overwrite any existing artifact.

### Measured model runs — only after clearance

Do not run the following until ethics, provider transfer, redaction review and
model-access evidence are in place. The key is read from `OPENAI_API_KEY`; never
paste a key into the study JSON, shell history or dissertation. The official
OpenAI endpoint is fixed, uses TLS, disables response storage, has no tools and
does not retry automatically. Failure stops the batch and retains a sanitized
error type, timings, any reported usage and unrun document IDs. Model refusal,
extra fields, invalid exact spans, invented quotes and unsafe links are rejected.
Schema and quotations do not prove semantic truth: human hallucination ratings
are still mandatory. An API call that fails may still be billed.

```sh
python -m research_evaluation.study_cli predict --input frozen.enc --key-file study.key --model gpt-5.6-luna --allow-external-api --output initial-run.enc
python -m research_evaluation.study_cli apply-run --input frozen.enc --key-file study.key --annotations initial-run.enc --output predicted.enc
python -m research_evaluation.study_cli blind --input predicted.enc --key-file study.key --output blinded-allocation.enc
python -m research_evaluation.study_cli export-rater --input blinded-allocation.enc --key-file study.key --rater A --output ratings-A.json
```

Repeat `export-rater` for B and C; it exports only the selected packet, never
the allocation key. The supervisor retains the encrypted allocation in the
approved lab and distributes only each rater's packet. Preserve the allocation hash.
Each of A/B/C rates both anonymous model/reference summaries on accuracy,
completeness, actionability, and absence of hallucination (integers 1–5), and
records a boolean fabricated-content flag. Unblind only after all ratings finish.
Import them using `review` with per-document `summary_ratings` and
`reference_ratings`, each a list of three records with `rater_id`, the four
criterion scores and `fabricated_content`. Gold is not editable after freezing.

One revision is supported with `predict --revision 1 --previous-run initial-run.enc
--revision-reason "Actual documented prompt or extraction change"`; retain both
outputs. The same frozen gold must match. The revision flag alone does not make
a real method change: version the changed prompt/rules and record that change.
Do not repeatedly tune on the evaluation set or change its labels after results.

The run manifest records requested/returned model, endpoint, SDK, prompt hash,
version, request ID where available, token counts, wall time, failures and retries.
Cost is deliberately unknown until calculated from actual usage and verified,
dated rates. An account-level model-list/access test still needs its own redacted
record. Do not use screenshots or the proposal's historic prices as new evidence.

### Audit, export and recovery

```sh
python -m research_evaluation.study_cli audit --input rated-study.enc --key-file study.key --output final-audit.json
python -m research_evaluation.study_cli export-study --input rated-study.enc --key-file study.key --output sanitized-study.json
python -m research_evaluation.study_cli restore-check --input rated-study.enc --key-file study.key --output artifact-restore.json
```

The explicit full study export is for the researcher/supervisor, **not annotators**.
It can be inspected with `/research`. The restore command verifies decryptability,
schema and hashes without writing plaintext; it is not a VM/Postgres/index restore
test. Arrange external drive/cloud destinations, backup scheduling and a monthly
whole-system restore drill separately. No existing data is deleted by this work.

## Submission package

Include the signed approvals and approved methodology; documented corpus
provenance/redaction; participant/training records; independent B/C exports and
agreement; adjudication and frozen hashes; redacted model verification and
versioned runs; blinded ratings; real timing comparison; threshold shortfalls and
error analysis; security/backup/restore/retention evidence; architecture/ER/class
diagrams; user/deployment guide; limitations and upstream attribution.

Use `PROJECT_PROVENANCE.md` and `ORIGINAL_CONTRIBUTIONS.md` to distinguish your
original contributions from the inherited foundation. Do not claim sole authorship
of inherited code, report development fixtures as human results, or claim global
performance from a curated Zambia pilot. A failed threshold is a research finding,
not a reason to alter the gold standard.

Implementation references checked on 23 October 2026:

- [OpenAI chat-completion request schema and storage control](https://developers.openai.com/api/reference/python/resources/chat/subresources/completions/methods/create).
- [The proposal's named model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-luna), which does not itself prove this account has access.
- [RFC 6238 TOTP](https://www.rfc-editor.org/info/rfc6238/) and [Fernet key handling](https://cryptography.io/en/latest/fernet/).

# Original Research Contributions

This file records the contribution boundary for the ATCIS research edition. It
is intentionally separate from the upstream feature list.

## Implemented in this working tree

1. **Configurable intelligence scope**
   - Global investigations remain geographically unrestricted.
   - The Zambia profile detects local terms, institutions, `.zm` domains,
     `+260` numbers and Zambian currency signals.
   - A Custom profile accepts any country, region or organisational focus.
   - Scope relevance changes ranking and explanation but never silently removes
     cross-border evidence.

2. **Evidence-grounded analyst experience**
   - Plain-English investigation briefing.
   - Ranked evidence excerpts with direct, partial and contextual match labels.
   - Persisted follow-up questions answered from case evidence with citations.
   - Guided and analyst-graph views for different levels of expertise.

3. **Research evaluation workbench**
   - Exact and partial entity-span precision, recall and F1.
   - Threat-category and geographic-scope classification accuracy and macro-F1.
   - Human-rated summary usefulness and fabricated-content failure counting.
   - Manual-versus-pipeline timing reduction and optional annotator-F1 parity.
   - Fixed success thresholds matching the supplied proposal (approval must be evidenced separately).

4. **Investigation controls and performance work**
   - User-selectable LLM model and Fast, Standard and Deep execution modes.
   - A time-boxed Fast profile with bounded scraping, enrichment, graph and
     summary phases, returning completed partial work when a deadline is hit.

5. **Evidence review and analyst decisions**
   - Case-owned source passages, publication/collection dates, and SHA-256
     fingerprints of retained text; missing publication dates stay unknown.
   - Exact/near-copy passage warnings. Different origins and graph links never
     automatically establish independent confirmation.
   - Accepted, rejected and further-review decisions with reasons, supporting
     source selections, next action, assignment label and revision history.
   - Optimistic edit versions, short row locks, and stale-evidence warnings.
   - Organization-name/domain matching and sector/country context hints, with
     explicit wording that a mention is not proof of an attack.
   - Plain-text case report and JSON evidence/history exports. These are
     application audit records, not tamper-proof forensic chain of custody.

6. **Reproducible candidate-filter comparison**
   - Shared text/gold labels for baseline and improved predictions, validated
     character spans, corpus hashes, duplicate counts and per-document errors.
   - A disclosed synthetic demonstration that runs the production quality gate
     against unfiltered candidates; no claim to have benchmarked upstream.
   - Missing human assessments cannot silently become a successful evaluation.

7. **Proposal-specific research workflow**
   - A strict Zambia pilot schema, 50-document composition and separate practice
     checks, exact nine-label spans and six-category/three-relevance outputs.
   - Label Studio blinded task exports and identity/hash-checked imports,
     UTF-16 conversion, Cohen's kappa and exact/partial span agreement.
   - Supervisor adjudication records, frozen-gold hashes, encrypted artifacts,
     blinded summary allocation, and versioned tool-free model-run manifests.
   - A readiness report that does not invent approvals, human measurements,
     infrastructure checks or claim a developer demonstration is a pilot.
   - Research-mode collection pause and individual TOTP MFA enrollment with
     encrypted secrets, replay protection and one-use recovery codes.

These additions do not constitute the proposed trained neural CTI sequence
tagger or the approved five-source controlled collector. See
[Submission readiness](docs/SUBMISSION_READINESS.md) for the remaining gaps.

## Evidence required before submission

- Commit every coherent feature under the researcher's identity.
- Preserve before/after design notes and test results.
- Run the 50-document benchmark and archive its JSON input and output.
- Record manual and automated investigation timings using identical documents.
- Document any AI-assisted code generation according to university policy.
- Obtain written approval before collecting live dark-web material.

This document is a living record. New claims should be added only after their
implementation and verification exist in the repository.

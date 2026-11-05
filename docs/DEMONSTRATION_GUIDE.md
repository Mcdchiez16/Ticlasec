# Final-year project demonstration

## Research claim

Present the system as **evidence-traceable threat investigation with analyst
review and measurable candidate-noise reduction**, not as an AI that proves
every scraped claim. Explain the upstream foundation and your changes using
`PROJECT_PROVENANCE.md` and `ORIGINAL_CONTRIBUTIONS.md`; retain attribution and
disclose AI assistance under your university's requirements.

## Suggested demonstration

1. Open a completed, clearly labelled synthetic investigation. This avoids
   depending on a live onion site's availability during the presentation.
2. From a briefing card select **Review evidence & record decision**, or open
   **Review & Report**. Show a named finding, its exact retained passage,
   defanged source URL, collection date, and text fingerprint. Explain that a
   source publication date may be unknown and is not necessarily an event date.
3. Inspect a repeated passage. Explain why two websites repeating text do not
   independently confirm a threat. Show a withheld extraction alongside a
   supported lead, rather than hiding the limitations of extraction.
4. Set **Organization focus** to an organization appearing in the synthetic
   evidence. Show direct name/domain relevance versus sector/country context.
   This is an evidence filter, not proof that the organization was attacked.
5. Select supporting passages, record an acceptance/rejection reason, an
   assigned team and a next action. Show the saved decision and history.
   Independent confirmation is an explicit analyst attestation requiring two
   non-duplicate, role-supported passages from different origins, not an AI badge.
6. Export the plain-text report and evidence JSON. Both include decisions and
   source details; JSON also preserves structured connections and history.
7. Open **Evaluation** → **Run evidence-quality demo**. Compare unfiltered
   candidates with the context/format gate. Show the remaining missed entity,
   repeated document and unmeasured human/timing fields. Download the dataset
   and results, and explain how the CLI reproduces the comparison.

## Work still needed for the dissertation

- Agree on the research question and evaluation procedure with your supervisor.
- Assemble 50 unique, authorized and sanitized documents separate from tuning
  data. Do not count the bundled synthetic examples as independent evaluation.
- Have humans annotate and adjudicate entities, classifications and summary
  quality; record baseline/improved outputs on identical evidence.
- Measure real investigation times under comparable conditions and include
  failures, false positives, missed threats and uncertainty in the write-up.
- Do not claim worldwide coverage or production-scale performance from a
  small pilot. Regional configuration and worldwide search are capabilities;
  multilingual quality and large-scale capacity still need separate testing.

The review history is an application-level audit trail. Stored-text hashes
detect changes relative to a recorded fingerprint; they do not authenticate a
website, prove a publication date, or provide tamper-proof forensic custody.

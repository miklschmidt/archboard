---
id: TASK-256
title: 'Act on the 2026-09-17 16:31 skill evaluation batch'
status: To Do
assignee: []
created_date: '2026-09-17 17:39'
updated_date: '2026-09-17 18:12'
labels: []
dependencies: []
references:
  - TASK-244
  - TASK-208.02
ordinal: 450000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The batch .skill-evals/2026-09-17T16-31-08-093Z is the first one that measures anything: it is the first run after TASK-254 took the scenario answers out of both skill packages. Baseline (the cleaned TASK-211 skill) and candidate (plus the TASK-243 and TASK-253 guidance) each passed 31 of 42 primary runs, and candidate authors spent 3.6% fewer tokens, so neither arm won. The TASK-253 rules landed where they were aimed: no candidate run put traffic on a teardown edge (2 of 3 baseline S00 runs did), no candidate run folded a named participant into a self call (one baseline S05 run did), and candidate beats name both sides of an ordering. In S07 the candidate lost the self message in 2 of 3 runs and the loop marker in 2 of 3, against the baseline's 1 of 3 and 0 of 3 — but the run-by-run counts do not support the obvious explanation, and TASK-256.06 carries what they do support.

Three failures belong to the evaluation rather than the authors: outcome checks match a name exactly, so the accurate `Werkzeug run_simple` and `Default JSON provider` failed six runs between them; S05 asks a beat to name one specific part where the prompt asks only why the context is pushed before dispatch; and five scenarios state things the source does not, which the grader flagged in every run of both arms. The user chose loose name matching; the node-kind vocabulary question is settled separately in TASK-255.

Each subtask was verified against the code before being written, and four of the first drafts were wrong: the beat check pools subjects across beats, so the obvious repair would have inverted the result; the density rule S14 wanted already exists and did not fire; the S08 renderer failures are a deterministic defect in one authored shape, not flaky layout; and the report's product-source column is a manifest schema dropping the count, not two classifiers disagreeing. Two product gaps surfaced that no scenario was looking for: an agent cannot read a comparison at all, and a deleted-and-changed issue names the field it disputes without its value.

One thing to do before any of this lands: these fixes change the evaluation inputs and the harness source, so assertBatchInputs will refuse to re-report this batch. Its report.json and report.md on disk are the last word on it — take what is still needed from them first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every subtask is done and bun run check passes
- [ ] #2 The evaluation inputs validate with bun run eval:skill check
- [ ] #3 The derived skills are synchronized with bun scripts/sync-skills.ts
<!-- AC:END -->

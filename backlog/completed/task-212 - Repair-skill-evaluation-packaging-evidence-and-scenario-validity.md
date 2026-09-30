---
id: TASK-212
title: 'Repair skill evaluation packaging, evidence and scenario validity'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-14 22:26'
updated_date: '2026-09-14 23:26'
labels: []
dependencies: []
references:
  - src/runtime/skill-evaluation
  - .skill-evals/2026-09-14T13-50-10-617Z/report.json
  - evals
priority: high
type: bug
ordinal: 372000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Planning only after the human-run batch .skill-evals/2026-09-14T13-50-10-617Z. Candidate authors read evals shipped inside their skill; file-change events were omitted from grading evidence; guardrails misclassified redirects; prompts/checklists disagree; resumed grader usage appears double-counted. Preserve the original batch and frozen baseline. Authors and graders stay human-run; home-isolation work is deferred.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Canonical evaluation inputs live in repository-root evals/ and are absent from installed/synchronized consumer skills; loaders, provenance, tests and maintained links use the new location.
- [x] #2 Recorded file changes and commands expose direct vault writes and evaluation-material reads to guardrails, graders and reports; harmless read-only redirects are not mutations.
- [x] #3 S00/S02/S08/S09/S10/S12/S14 prompts, fixtures, outcomes and rubric agree on requested observable behavior and source-grounded architecture; inherited fixture defects and unavailable renders are attributed accurately.
- [x] #4 Pinned Codex usage semantics are verified without model calls; resumed usage is counted once and protected by synthetic regression tests.
- [x] #5 Original batch artifacts remain untouched; any later corrected report names its source, corrections, contamination and comparability limits.
- [x] #6 Focused model-free tests and bun run check pass after independent-scope and boundary review; no eval authors or graders run.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move skills/archboard/evals to evals/ at the repository root; update the eval script, provenance, suite/provenance tests, TESTING.md, archboard-dev skill, preservation assessment and .gitignore comment; add a fast test that the tracked consumer skill, the frozen baseline and a prepared copy hold no evals directory.
2. Evidence: parse file_change items into the trace; classify commands and file changes with an exposure context (evaluation inputs, harness source, other runs); doing-on-writes fails on a recorded vault file change, redirects count only when they target the vault, --doing accounting ignores help calls and text searches; bundle, run.json and report carry direct writes and evaluation-material exposure; report lists contaminated runs.
3. Scenarios: S00 call structure and unbound externals; S02/S12 comparison counts by kind; S03/S09 truthful groups and edges, observable hidden-member answer; S08 honest vocabulary-before-write contract with the refusal owned by policy.test.ts; S10 finalize_request in the fixture; S11 tag edge direction; S12 selection intent observable; S14 externals asked for and counts aligned; rubric: edge replacement rule, inherited fixture content judged as premise, render availability stated.
4. Usage: pinned semantics verified from the retained rollout (turn.completed usage in a resumed thread is the thread's cumulative total); session usage is the last cumulative reading per thread, per-call usage the difference; synthetic regression tests; pins.json usageSemantics updated.
5. Original batch untouched; write docs/design/skill-evals/2026-09-14-batch-corrections.md naming the source batch, every correction, contaminated runs and comparability limits; note the S11 product fix (TASK-213).
6. bun test src/runtime/skill-evaluation, store tests, bun run check. No author or grader runs.

Implementation review against 08bbe876: fix verified identity authorization, evidence classification/reporting and scenario-contract findings within task scope; preserve TASK-216 renderer changes; verify focused model-free tests and full normal gate with required loopback access; update acceptance evidence and commit only TASK-212/213 files. No author evals or grader runs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: evals moved to repository-root evals/ (loader, provenance tests, TESTING.md, archboard-dev skill, preservation assessment, .gitignore, install fixture list) with a fast test refusing evals inside the consumer skill, the frozen baseline or a prepared copy and an install assertion. Evidence: file_change items parsed into the trace; doing-on-writes fails on a board file patched under the vault; redirects count only when they target a board file; --doing accounting ignores help calls and text searches; exposure classified per command (evaluation-inputs, harness-source, other-run) with roots from the job; bundle, run.json, report (contaminated/direct column, contamination section, token change withheld) carry it. Usage: turn.completed in a resumed thread verified cumulative from the retained rollout; callUsage per call and sessionUsage = last reading per thread; pins.json usageSemantics updated. Scenarios: S00 prompt/features, S02/S12 comparison counts by kind (removedNodes), S03/S09 wsgi-layer group and truthful serving edge, S08 config.before-board, S09 phrasing-free hidden member, S10 finalize_request fixture, S01/S11 tag edge direction, S12 process_response and observable selection intent, S14 externals and 8-20 bounds, rubric edge rule/inherited content/render availability; coverage owners updated. Corrections document: docs/design/skill-evals/2026-09-14-batch-corrections.md (model-free re-audit: grader usage 102.3M -> 11.6M, 5 S11 direct writes, 8 exposed runs, 30 false --doing counts, per-scenario invalidations, what still stands). Original batch untouched. Tests: src/runtime/skill-evaluation/tests/evidence.test.ts plus updated suite/outcomes/report tests.

Validation: bun run eval:skill check (15 scenarios, 15 fixtures, 14 parts); bun test --isolate src/runtime/skill-evaluation (71 pass incl. evidence.test.ts), tests/system/cli/install-targets.test.ts (9 pass, installed skill carries no evals); lint, fmt, type-check clean; module lane 3005 pass. Pre-existing unrelated failure: tests/system/cli/resource-cleanup.test.ts (4 cases fail on the untouched tree too).

Gate: lint, fmt:check, type-check, build and the module lane (3005 tests) pass; test:repository and test:serial-browser pass when run explicitly; the only failures in bun run check are the 4 pre-existing resource-cleanup cases that fail on the untouched tree.

Independent review fixes: count shell mutations and file_change board writes; unwrap real Nix shell paths; detect composite-command writes and relative sibling-run exposure without vault-prefix false positives. Suppress token and quality comparisons for contaminated, direct-write or unaudited runs. Recompute legacy grader totals from cumulative retained sessions without changing artifacts. Include nested steps and beats in comparison totals and require the S11 current description. Keep audit-only exports on the audit entry point and repair skill prose. Final verification supersedes earlier resource-cleanup failure notes: resource-cleanup passes all 4 tests with required loopback permissions; bun run check passes in full (exit 0), including module, system, repository and browser lanes. Model-free suite input check passes: 15 scenarios, 15 fixtures, 14 coverage parts. No author evaluations or graders were run; TASK-216 excluded.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved canonical evaluation inputs to root evals/ and kept consumer skills clean. Repaired evidence auditing, legacy cumulative usage, audit-aware report comparisons, and scenario contracts. Independent scope and boundary reviews found and fixed command/file-change accounting, identity/evidence integration and nested comparison counts. Verified with the complete bun run check gate and model-free suite validation; retained batch artifacts untouched and no authors or graders run.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: TASK-212
title: 'Repair skill evaluation packaging, evidence and scenario validity'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-14 22:26'
updated_date: '2026-09-14 22:35'
labels: []
dependencies: []
references:
  - src/runtime/skill-evaluation
  - skills/archboard/evals
  - .skill-evals/2026-09-14T13-50-10-617Z/report.json
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
- [ ] #1 Canonical evaluation inputs live in repository-root evals/ and are absent from installed/synchronized consumer skills; loaders, provenance, tests and maintained links use the new location.
- [ ] #2 Recorded file changes and commands expose direct vault writes and evaluation-material reads to guardrails, graders and reports; harmless read-only redirects are not mutations.
- [ ] #3 S00/S02/S08/S09/S10/S12/S14 prompts, fixtures, outcomes and rubric agree on requested observable behavior and source-grounded architecture; inherited fixture defects and unavailable renders are attributed accurately.
- [ ] #4 Pinned Codex usage semantics are verified without model calls; resumed usage is counted once and protected by synthetic regression tests.
- [ ] #5 Original batch artifacts remain untouched; any later corrected report names its source, corrections, contamination and comparability limits.
- [ ] #6 Focused model-free tests and bun run check pass after independent-scope and boundary review; no eval authors or graders run.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move skills/archboard/evals to evals/ at the repository root; update the eval script, provenance, suite/provenance tests, TESTING.md, archboard-dev skill, preservation assessment and .gitignore comment; add a fast test that the tracked consumer skill, the frozen baseline and a prepared copy hold no evals directory.
2. Evidence: parse file_change items into the trace; classify commands and file changes with an exposure context (evaluation inputs, harness source, other runs); doing-on-writes fails on a recorded vault file change, redirects count only when they target the vault, --doing accounting ignores help calls and text searches; bundle, run.json and report carry direct writes and evaluation-material exposure; report lists contaminated runs.
3. Scenarios: S00 call structure and unbound externals; S02/S12 comparison counts by kind; S03/S09 truthful groups and edges, observable hidden-member answer; S08 honest vocabulary-before-write contract with the refusal owned by policy.test.ts; S10 finalize_request in the fixture; S11 tag edge direction; S12 selection intent observable; S14 externals asked for and counts aligned; rubric: edge replacement rule, inherited fixture content judged as premise, render availability stated.
4. Usage: pinned semantics verified from the retained rollout (turn.completed usage in a resumed thread is the thread's cumulative total); session usage is the last cumulative reading per thread, per-call usage the difference; synthetic regression tests; pins.json usageSemantics updated.
5. Original batch untouched; write docs/design/skill-evals/2026-09-14-batch-corrections.md naming the source batch, every correction, contaminated runs and comparability limits; note the S11 product fix (TASK-213).
6. bun test src/runtime/skill-evaluation, store tests, bun run check. No author or grader runs.
<!-- SECTION:PLAN:END -->

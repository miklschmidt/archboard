---
id: TASK-213
title: Restore a removed node identity through reconciliation edits
status: Done
assignee:
  - '@codex'
created_date: '2026-09-14 22:26'
updated_date: '2026-09-14 23:26'
labels: []
dependencies: []
references:
  - src/runtime/semantic-board-store/lib/edit-content.ts
  - src/runtime/semantic-board-store/lib/transitions.ts
  - skills/archboard/references/variants.md
  - TASK-212
priority: high
type: bug
ordinal: 373000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
S11 in .skill-evals/2026-09-14T13-50-10-617Z asks for an ordinary edit restoring Tagged JSON under its original id after partial resolution. The documented skill promises this, but node editing rejects an id absent from the selected draft; five authors bypassed the CLI and patched the vault directly. Permitting the id alone is insufficient because editing the draft must also update its own reconciliation standing. This is a separate product fix from TASK-212 evaluation repairs. Planning only; no agent may run eval authors or graders.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An ordinary edit to a draft can restore a removed node under the original id when an open deleted-and-changed disagreement and its recorded reconciliation ancestry establish that identity.
- [x] #2 The requested restoration and field values persist atomically, settle the answered disagreement consistently with the documented third-answer contract, preserve unrelated unresolved issues and keep the variant a draft.
- [x] #3 Arbitrary absent ids, unrelated sibling/history ids and reuse without the matching disagreement remain rejected; adding a node without an id still mints a new identity.
- [x] #4 A focused store-level regression reproduces the S11 partial-resolution then restoration workflow, verifies atomic failure and identity boundaries, and confirms unrelated disagreements remain visible.
- [x] #5 CLI/help/schema and canonical skill guidance agree with the supported restoration contract; relevant normal checks pass without running author evaluations or grading.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Store: let idForNode accept a stated id absent from the draft when the draft's own reconciliation holds a deleted-and-changed issue for that subject (the draft removed it, the predecessor changed it); every other absent id stays UNKNOWN_NODE.
2. Transition: when an edit to a conflicted draft restores such a subject, treat it as a settlement in the same write: move the base's subject to the predecessor's, re-run the catch-up merge, keep unrelated issues open, clear the standing when nothing is left, and carry the outcome down to descendants; the variant stays a draft and the whole family lands in one version.
3. Store-level regression (settlement.test.ts sibling): S11 shape (rename+reword+remove in draft, parent edits all three), partial resolve, restoration under the original id with own wording, atomic failure on a bad id, sibling/history/arbitrary ids refused, id-less add mints, unrelated issue stays visible.
4. Contract text: node input schema description, authoring.md refusals row, variants.md third-answer paragraph; regenerate skill artifacts; sync skills; bun run check.

Implementation review against 08bbe876: fix verified identity authorization, evidence classification/reporting and scenario-contract findings within task scope; preserve TASK-216 renderer changes; verify focused model-free tests and full normal gate with required loopback access; update acceptance evidence and commit only TASK-212/213 files. No author evals or grader runs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: idForNode accepts a stated id absent from the draft only when the draft's own reconciliation holds a deleted-and-changed issue for it (restorableNodes in lib/restore.ts); the edit transition then settles that issue in the same write through the catch-up shared with resolve (settle.ts caughtUp), moving the base's subject to the predecessor's so the restored wording reads as the draft's own change and is durable; unrelated issues stay open and are reported as the draft's conflicted outcome; adoption moved to lib/adopt.ts to keep settle.ts within the line budget. Regression: src/runtime/semantic-board-store/tests/restoration.test.ts (8 cases: S11 shape, partial resolve, restoration with the predecessor's and with a third wording, durability under a later parent edit, restoration before the field choices, arbitrary/sibling/settled ids refused with nothing written, id-less add mints, atomic failure). Contract text: input.ts node id doc, authoring.md unknown-id row, variants.md third-answer paragraph; skills synced.

Validation: bun test --isolate src/runtime/semantic-board-store src/shared/semantic-board (247 pass incl. restoration.test.ts 8 cases), tests/system/semantic-boards (27 pass), bun run lint and fmt clean, type-check clean; bun run check module lane 3005 pass. tests/system/cli/resource-cleanup.test.ts fails 4 cases identically on the untouched tree (ANSI-coloured assertion text), unrelated.

Independent review found that a deleted relationship or flow could masquerade as a restored node. Restoration now requires the subject to exist as a node in both recorded reconciliation base and recorded predecessor, with atomic rejection regression coverage. The restoration suite now has 9 cases. Final boundary review passed (41 focused tests across restoration, evidence and comparison contracts). Full bun run check passes (exit 0) with required local-loopback permissions, superseding earlier resource-cleanup failure notes; resource-cleanup itself passes all 4 cases. No author evaluations or graders were run.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ordinary draft edits can restore a removed node under its established identity, settle that disagreement atomically through shared catch-up, preserve unrelated issues and keep the draft state. Recorded base and predecessor both establish node kind, preventing relationship/flow ID reuse. Updated schema and skill guidance, with 9 restoration regressions and full bun run check passing. Independent contract review passed; no author evaluations or graders run.
<!-- SECTION:FINAL_SUMMARY:END -->

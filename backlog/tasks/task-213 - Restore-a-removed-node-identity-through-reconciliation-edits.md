---
id: TASK-213
title: Restore a removed node identity through reconciliation edits
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-14 22:26'
updated_date: '2026-09-14 22:35'
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
- [ ] #1 An ordinary edit to a draft can restore a removed node under the original id when an open deleted-and-changed disagreement and its recorded reconciliation ancestry establish that identity.
- [ ] #2 The requested restoration and field values persist atomically, settle the answered disagreement consistently with the documented third-answer contract, preserve unrelated unresolved issues and keep the variant a draft.
- [ ] #3 Arbitrary absent ids, unrelated sibling/history ids and reuse without the matching disagreement remain rejected; adding a node without an id still mints a new identity.
- [ ] #4 A focused store-level regression reproduces the S11 partial-resolution then restoration workflow, verifies atomic failure and identity boundaries, and confirms unrelated disagreements remain visible.
- [ ] #5 CLI/help/schema and canonical skill guidance agree with the supported restoration contract; relevant normal checks pass without running author evaluations or grading.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Store: let idForNode accept a stated id absent from the draft when the draft's own reconciliation holds a deleted-and-changed issue for that subject (the draft removed it, the predecessor changed it); every other absent id stays UNKNOWN_NODE.
2. Transition: when an edit to a conflicted draft restores such a subject, treat it as a settlement in the same write: move the base's subject to the predecessor's, re-run the catch-up merge, keep unrelated issues open, clear the standing when nothing is left, and carry the outcome down to descendants; the variant stays a draft and the whole family lands in one version.
3. Store-level regression (settlement.test.ts sibling): S11 shape (rename+reword+remove in draft, parent edits all three), partial resolve, restoration under the original id with own wording, atomic failure on a bad id, sibling/history/arbitrary ids refused, id-less add mints, unrelated issue stays visible.
4. Contract text: node input schema description, authoring.md refusals row, variants.md third-answer paragraph; regenerate skill artifacts; sync skills; bun run check.
<!-- SECTION:PLAN:END -->

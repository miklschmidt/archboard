---
id: TASK-213
title: Restore a removed node identity through reconciliation edits
status: To Do
assignee: []
created_date: '2026-09-14 22:26'
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

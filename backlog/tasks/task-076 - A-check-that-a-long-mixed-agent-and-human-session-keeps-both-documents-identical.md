---
id: TASK-076
title: >-
  A check that a long mixed agent and human session keeps both documents
  identical
status: To Do
assignee: []
created_date: '2026-08-20 20:16'
labels: []
dependencies:
  - TASK-074
  - TASK-071
references:
  - docs/design/server-is-the-truth.md
  - scripts/check-changes.mjs
priority: high
type: task
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 7 of docs/design/the-plan.md. This is acceptance criterion 6 on TASK-065 and it is the check that makes the whole source-of-truth change worth having. Without it, "the server is the truth" is a claim rather than a property.

WHAT IT DOES. Drive a long session of mixed agent and human writes against one board and assert that what the pane holds and what the server holds stay byte-identical throughout, not merely at the end.

WHAT THE SESSION HAS TO CONTAIN, because a short happy path proves nothing:

- Agent creates, including labelled shapes and bound arrows, so the server mints ids the pane never named.
- Human drags, resizes, retypes a label and deletes an element, arriving as change reports.
- Both interleaved closely enough that an echo lands while another write is in flight.
- At least one element written by both sides.
- Enough cycles to catch something that grows by one each time. TASK-024 took many round-trips to reach 42 copies of one label, and a check that runs three cycles would not have caught it.

HOW TO COMPARE. Serialise both sides with the same key ordering and ignore only what is genuinely allowed to differ: `version`, `versionNonce`, `updated` and the server's own `createdAt`, `updatedAt` and `syncedAt` timestamps. State the ignore list in the script, because an ignore list that grows quietly is how this check stops meaning anything.

FAIL LOUDLY AND USEFULLY. When they diverge, print the element id, the field, both values, and the cycle number it first diverged on. A check that says "documents differ" on a 55-element board costs an hour before anybody knows what happened.

WHETHER IT NEEDS A REAL BROWSER. Probably, for the human half, and TASK-071 will have settled how a check drives one. If a socket standing in for a pane can produce the same interleaving, that is cheaper and fine, but say which was chosen and why: a fake pane that converts nothing cannot catch a divergence caused by conversion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A check drives many cycles of interleaved agent and human writes on one board, including labelled shapes, bound arrows, a rename and a delete
- [ ] #2 It asserts the pane document and the server document are byte-identical after every cycle, not only at the end
- [ ] #3 The list of fields it ignores is stated in the script, and is limited to version, versionNonce, updated and the server own timestamps
- [ ] #4 A divergence is reported with the element id, the field, both values and the cycle it first appeared on
- [ ] #5 It is part of bun run test
<!-- AC:END -->

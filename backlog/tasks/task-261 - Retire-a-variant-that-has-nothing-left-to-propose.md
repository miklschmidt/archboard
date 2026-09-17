---
id: TASK-261
title: Retire a variant that has nothing left to propose
status: To Do
assignee: []
created_date: '2026-09-17 22:29'
labels: []
dependencies: []
references:
  - docs/adr/0015-one-document-per-board.md
  - TASK-257
ordinal: 468000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A draft can outlive its proposal, and there is no way to say so. `Canvas server` carries a draft named `Readable layout` that proposes nothing — it was a fixture for comparing renderer layouts — and `Semantic renderer`'s draft of the same name has settled into agreement with its parent, because the change it proposed has since been implemented. Neither can be adopted: adopting freezes the accurate current variant into history and promotes a variant that says the same thing. So both stay as drafts that a reader has to open to discover are empty, and every board that carries one renders and compares it forever.

The question this task has to answer before it writes code: what a variant that has served its purpose becomes. Not adopted, since nothing should change; not deleted, if a proposal that was considered and dropped is worth keeping; and whatever it becomes must still satisfy the rule that the file is the board and one document holds every variant of it (ADR 0015, ADR 0023).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A variant that has nothing left to propose can be retired through the CLI, and the board says what happened to it
- [ ] #2 A retired variant is not offered as a proposal to compare or adopt, and the current variant is untouched
- [ ] #3 The two spent drafts in the tracked vault are retired
<!-- AC:END -->

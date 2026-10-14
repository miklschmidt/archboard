---
id: TASK-472.13
title: A pane dives into a board of another repository
status: To Do
assignee: []
created_date: '2026-10-14 21:49'
labels:
  - frontend
dependencies:
  - TASK-472.12
  - TASK-472.05
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 833000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once a drill-down can name another repository and a pane can show any repository, the pane dives into that board like any other drill-down (ADR 0050). Everything stays in one browser tab.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Activating a drill-down into another repository dives into that board in the same pane
- [ ] #2 The breadcrumb leads back across repositories
- [ ] #3 A drill-down into an identity with no known checkout opens nothing, and the inspector says that the repository is not registered and how to register it
- [ ] #4 PRODUCT.md and the archboard skill describe drill-down across repositories as built
- [ ] #5 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

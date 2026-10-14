---
id: TASK-472.11
title: The agent dock shows the conversation of the checkout the user last activated
status: To Do
assignee: []
created_date: '2026-10-14 21:49'
labels:
  - frontend
dependencies:
  - TASK-472.10
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
ordinal: 831000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
With one workhorse per checkout, the agent dock must show one of them. ADR 0050 decides the shown conversation: the checkout the user last activated by focusing a pane, opening a board or drilling down, or picked from a list of the tab's live workhorses. What an agent does to a pane never changes it, so it never changes while somebody types.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Focusing a pane, opening a board from the navigator and drilling down switch the shown conversation to that board's checkout, and `browser show` never does
- [ ] #2 The dock lists the live workhorses of the tab session by repository and checkout, and picking one shows it
- [ ] #3 The list marks a workhorse that waits for an approval or for the user
- [ ] #4 A typed message goes to the shown checkout's workhorse, and New conversation replaces only that workhorse
- [ ] #5 A coordinator turn shows in the conversation of the workhorse it delegated to, and a turn that delegated nothing shows in the conversation shown while it ran
- [ ] #6 The Stop control stops the shown workhorse, and a spoken stop stops every running workhorse of the tab session
- [ ] #7 The list and its marks are operable from the keyboard and have accessible names
- [ ] #8 PRODUCT.md's description of the agent dock and the archboard skill describe the shown conversation as built
- [ ] #9 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

---
id: TASK-472.15
title: archboard semantic move moves a board to another repository
status: To Do
assignee: []
created_date: '2026-10-14 21:49'
labels: []
dependencies:
  - TASK-472.12
  - TASK-472.06
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 835000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A board sometimes lives in the wrong repository, for example a board that a meta project drew for a product repository. ADR 0051 decides the move: the whole note moves with every variant, former name and subject id, drill-downs that the move changes are rewritten to name repository identities, and the writes run in a fixed order because two vaults cannot share one write. This task builds the store operation and its CLI form; the browser task after it adds the control.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `archboard semantic move <board> --to <dir> --doing <line>` moves the whole note into the vault found from `<dir>`, with every variant, former name and subject id unchanged
- [ ] #2 Drill-downs in the source vault into the moved board, and drill-downs on the moved board into the source vault, are rewritten to name repository identities
- [ ] #3 The move refuses between two checkouts of one identity, while another holder claims the board or its name in the target, when the target vault has a board or former name of that name, and when it needs a drill-down into an untracked vault
- [ ] #4 The move holds the lease in both vaults, writes the target note first, rewrites the drill-downs, and deletes the source note last; a move that stopped part way leaves the board in both vaults, and running it again finishes it
- [ ] #5 The answer lists every rewritten drill-down
- [ ] #6 The archboard skill and the help of `semantic move` describe the move and its refusals
- [ ] #7 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

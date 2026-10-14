---
id: TASK-472.04
title: Every server call names its vault
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-14 21:49'
updated_date: '2026-10-14 22:45'
labels: []
dependencies:
  - TASK-472.01
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
parent_task_id: TASK-472
ordinal: 824000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The server resolves every board call against the one vault it started with. ADR 0049 requires every call to name its vault, because one server will serve every vault and has no working directory. Expand step: the server still starts with `ARCHBOARD_VAULT`, and until the navigator task the browser addresses that one vault, which the server reports to it. The CLI already knows its vault and sends it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every board route (list, read, render, the writes, claim, release, take-back, locality, footprint, vault check, code check, code findings, pane show, semantic context and code target open) refuses a call that names no vault, and the refusal says how to name one
- [ ] #2 The CLI names its vault on every server call
- [ ] #3 With two vaults served by one server, a write to a board in one vault is announced only to panes that show that board in that vault, even when the other vault has a board of the same name
- [ ] #4 Leases, claims, doing lines, the agent activity list, the settled change feed, the lock sweep and the disk watch are keyed by vault and board together
- [ ] #5 The browser names the vault of each pane on every call and socket message
- [ ] #6 The opt-in topology lane still passes
- [ ] #7 AGENTS.md's invariants, the archboard-dev skill and TESTING.md describe vault naming as built
- [ ] #8 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

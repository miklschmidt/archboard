---
id: TASK-472.08
title: >-
  archboard runs the source of the archboard checkout it stands in, and each
  worktree has its own port
status: To Do
assignee: []
created_date: '2026-10-14 21:49'
labels: []
dependencies:
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
ordinal: 828000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A worktree of archboard that changes server source needs a server that runs its own source, and today it would take port 3000 from the owner's daily server. `./bin/dogfood` exists only to choose archboard's vault, which the CLI now finds by itself. ADR 0049 decides: inside an archboard checkout `archboard` runs that checkout's source, the main checkout keeps port 3000, and a linked worktree gets a stable port from its path, as worktrunk's `hash_port` does from a branch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Inside an archboard checkout whose source is not the running source, `archboard` executes that checkout's `bin/archboard` with the same arguments and environment
- [ ] #2 The main archboard checkout uses port 3000, and a linked worktree uses a port that is a stable hash of its root path into 10000 to 19999, the same on every run
- [ ] #3 A set `ARCHBOARD_URL` or `--url` still decides the URL
- [ ] #4 `/health` reports the source checkout of the server, and a command that finds a server of other source on its port refuses and names both checkouts
- [ ] #5 `bin/dogfood` is deleted, and nothing in the repository runs or names it except history
- [ ] #6 AGENTS.md, TESTING.md, .archboard/README.md, PRODUCT.md, docs/agents/readme-assets.md and the archboard-dev skill say `archboard` where they said `./bin/dogfood`, and describe worktree servers and ports
- [ ] #7 Each dogfood board that this task changes has a proposal named by the task id that matches what was built, as the archboard-dev skill says, or the plan says that no board is affected
<!-- AC:END -->

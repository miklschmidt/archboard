---
id: TASK-472
title: One Archboard server serves every vault
status: To Do
assignee: []
created_date: '2026-10-14 21:49'
labels: []
dependencies: []
references:
  - >-
    docs/adr/0049-one-server-serves-every-vault-and-every-call-names-its-vault.md
  - >-
    docs/adr/0050-the-browser-is-one-app-and-each-checkout-has-its-own-workhorse.md
  - docs/adr/0051-a-person-can-move-a-board-to-another-repository.md
documentation:
  - backlog/docs/doc-002 - One-Archboard-server-for-every-vault.md
ordinal: 820000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today one Archboard server serves one vault, which it reads from `ARCHBOARD_VAULT` when it starts. The owner keeps boards in the `.archboard/vault` of several repositories and plans across them in meta projects, so daily use needs one server per vault on separate ports, and a command can reach a server that holds another vault without a word. ADR 0049, ADR 0050 and ADR 0051 (2026-10-14) decide one machine server for every vault, a browser that is one app over every registered repository with one workhorse for each checkout, and moving a board between repositories. Backlog doc-002 is the specification, with the user stories and the test seams. The subtasks are its tracer-bullet slices in dependency order.
<!-- SECTION:DESCRIPTION:END -->

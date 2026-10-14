---
id: TASK-471.01
title: A repository's vault is found at its root when ARCHBOARD_VAULT is unset
status: To Do
assignee: []
created_date: '2026-10-14 14:39'
labels: []
dependencies: []
parent_task_id: TASK-471
ordinal: 817000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants plain `archboard` to work in a set-up repository, and the setup block can then drop the absolute vault path. ADR 0015 made the server refuse to start without a vault, so that nobody draws into nowhere. `install-skill` already creates `<repo>/.archboard/vault`, so finding that directory reads a choice that somebody made instead of guessing one. A default for each repository makes two vaults on one machine common. One Archboard server on a URL keeps the vault that it started with, and today nothing compares that vault with the vault of the command, so a command in one repository can write into the vault of another.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With `ARCHBOARD_VAULT` unset, every command and the server that it starts use `.archboard/vault` under the root of the nearest enclosing Git repository, when that directory exists
- [ ] #2 With `ARCHBOARD_VAULT` unset and no such directory, the command refuses as before, and the refusal names `ARCHBOARD_VAULT` and `archboard install-skill`
- [ ] #3 A set `ARCHBOARD_VAULT` still decides the vault
- [ ] #4 The server reports the vault that it serves, and a command whose vault differs from the vault of the running server on its URL is refused before it reads or writes, with a message that names both vaults and what to do
- [ ] #5 An ADR records the default and how it keeps the rule of ADR 0015, and the config comment, the no-vault refusal, CONTEXT.md, INSTALL.md and the archboard skill describe it
<!-- AC:END -->

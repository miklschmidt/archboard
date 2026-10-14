---
id: TASK-471.03
title: >-
  install-skill writes no setup block, and archboard-pr triggers on the vault
  directory
status: To Do
assignee: []
created_date: '2026-10-14 14:40'
updated_date: '2026-10-14 21:39'
labels: []
dependencies: []
parent_task_id: TASK-471
ordinal: 819000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The block that `install-skill` writes into a repository's CLAUDE.md or AGENTS.md is tracked and shared, but it holds absolute paths of the machine that ran the installer, and it restates the archboard skill. ADR 0049 (2026-10-14) leaves the block nothing to say: the CLI finds the vault at `<git root>/.archboard/vault` with nothing exported, `ARCHBOARD_VAULT` is removed, and the server URL is derived. The block's one other use is the trigger of the archboard-pr skill, which today fires on "a repository whose AGENTS.md or CLAUDE.md names ARCHBOARD_VAULT". This task depends on the migration task that removes `ARCHBOARD_VAULT`; add that dependency when the migration tasks exist.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `install-skill` writes no block into CLAUDE.md or AGENTS.md
- [ ] #2 Rerunning `install-skill` in a repository that holds a block from an earlier version removes that block and leaves the rest of the file unchanged, and its output says so
- [ ] #3 The archboard-pr skill triggers on a repository that has `.archboard/vault`, and no shipped skill names `ARCHBOARD_VAULT`
- [ ] #4 A test holds that no file that `install-skill` writes into a repository contains a path of the machine that ran it
<!-- AC:END -->

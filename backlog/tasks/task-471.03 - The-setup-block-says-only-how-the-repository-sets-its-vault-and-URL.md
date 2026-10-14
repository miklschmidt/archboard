---
id: TASK-471.03
title: The setup block says only how the repository sets its vault and URL
status: To Do
assignee: []
created_date: '2026-10-14 14:40'
labels: []
dependencies:
  - TASK-471.01
parent_task_id: TASK-471
ordinal: 819000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The block that `install-skill` writes into a repository's CLAUDE.md or AGENTS.md is tracked and shared. It holds the absolute skill path and the absolute vault path, and the absolute CLI path when the CLI is not on PATH. It also restates what the archboard skill says. A repository can set its vault with direnv or a .env file, and the block must describe what the repository does, not the shell of the machine that ran the installer. The owner chose that the installer names the file that sets the vault.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The block gives the vault relative to the repository root, or says that the vault is outside the repository and comes from the environment, with no path
- [ ] #2 When the repository's `.envrc` or `.env` sets `ARCHBOARD_VAULT`, the block names that file. When the vault is the default `.archboard/vault`, the block says that no setting is needed. Otherwise the block gives one portable command
- [ ] #3 The block names `ARCHBOARD_URL` only when it is not the default, and then says where the repository sets it
- [ ] #4 The block holds no path of the machine that ran the installer and nothing that the archboard skill already says, and a test holds both
- [ ] #5 Rerunning the installer replaces an old block in place
- [ ] #6 The archboard and archboard-pr skills find the vault the way the new block states it
<!-- AC:END -->

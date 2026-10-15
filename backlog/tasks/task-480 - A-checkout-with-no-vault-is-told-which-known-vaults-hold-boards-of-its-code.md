---
id: TASK-480
title: A checkout with no vault is told which known vaults hold boards of its code
status: To Do
assignee: []
created_date: '2026-10-15 18:19'
labels: []
dependencies: []
priority: medium
ordinal: 845000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Some teams keep the architecture of a code repository in another repository. Admin-By-Request keeps the boards of Platform in Docs-Architecture-Design, and their nodes bind Platform code with `binding.repo` github.com/Admin-By-Request/Platform. An agent that works in a Platform checkout, such as ~/Work/Platform, runs a board command and gets `VAULT_NOT_FOUND` (exit 2). The message suggests `archboard install-skill`, which would create an empty vault in Platform, or `-C <dir>` without naming a directory. No command searches the known vaults for a board by name or by the code it binds, so the agent finds the boards only when the user gives it the path. Found during the archboard-pr audit of Platform #599 to #615 (TASK-478). The checkout registry (`archboard repo list`) already knows every checkout, its repository identity and every untracked vault. Local paths in the message are for the agent only: archboard-pr already keeps local paths out of a pull request body. Docs-Architecture-Design still uses the old `architecture-design/` layout with `ARCHBOARD_VAULT` and is not in the registry, so this hint finds it only after that repository moves to `.archboard/vault`. That move is work in that repository, not here.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Inside a git checkout with no vault, when a vault that the registry knows (the vault of a chosen checkout, or an untracked vault) holds boards with a node bound to the checkout's repository identity, the `VAULT_NOT_FOUND` refusal names the directory of each such vault as the `-C` to give, and the names of those boards
- [ ] #2 When such a vault exists, the refusal leads with `-C` and not with `archboard install-skill`; when none exists, the refusal says what it says today
- [ ] #3 The refusal still exits 2, and nothing is registered, created or written
- [ ] #4 The archboard skill tells an agent in a checkout with no vault to follow that hint, and the archboard-pr skill's rule for architecture kept in another repository points to it
- [ ] #5 A test owner proves the named vault directory, the board names and the exit status for a checkout that a known vault binds, and the unchanged refusal for one that none binds, without matching the wording of the message
<!-- AC:END -->

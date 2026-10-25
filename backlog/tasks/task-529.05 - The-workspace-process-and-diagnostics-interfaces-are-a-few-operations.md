---
id: TASK-529.05
title: The workspace, process and diagnostics interfaces are a few operations
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
updated_date: '2026-10-25T01:39:00Z'
labels: []
dependencies: []
parent_task_id: TASK-529
type: task
ordinal: 946000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of TASK-529 for the workspace, process and diagnostics package(s). TASK-500 kept every name callers imported, so callers assemble internals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The callers use only the package's narrowed public entries, and the package's focused tests, type-check and lint pass
- [ ] #2 Each public entry exposes operations a caller needs, measured by the names and facts it must learn
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Workspace 58 -> 52 names (8 subpaths). `findAndRegisterVault` (`./vault`) replaces the CLI's `findVault` + `declareIfUnknown` + `Declared` mapping + registry-failure catch; `declareIfUnknown`, `Declared`, `FoundVault`, `VaultNotFound` and `VaultSearch` left the interface. `gitCheckoutOfVault` (`./checkouts`) replaces code-binding's own synchronous Git spawn plus `existingDir`, `repoIdentityFor` and `GitCommandError`. process (19) and diagnostics (11) unchanged: codex-app-server imports most of their names and keeps them while TASK-530.03 relicenses them. Left: `./git-group` of process exposes 5 names to its one caller (the Git client of workspace); `registeredRepositoryOfVault` still collides in name with `repositoryOfVault` of `./repository-listing`. Checks: type-check 0, lint 0, focused tests of workspace, code-binding, repository-policy and tests/system/cli/vault-finding.test.ts 0.
<!-- SECTION:NOTES:END -->

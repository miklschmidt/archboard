---
id: TASK-529.05
title: The workspace, process and diagnostics interfaces are a few operations
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
updated_date: '2026-10-25T01:59:00Z'
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

Second round (ambition target 45): 88 -> 66 names across the three packages (workspace 42, process 14, diagnostics 10). The Git command runner, its failure type and its output drain moved from workspace into process, which exports `git` and `GitCommandError` from `./git` in place of the five-name `./git-group`. `errorCode` duplicated `errnoCode` exactly and is gone. `writeFileAtomic(file, data, { exclusive: true })` replaces `writeFileAtomicExclusive`. Callers derive the types their schemas parse or their functions answer: `CheckoutChoice`, `RepositoryListing`, `ConfiguredServer`, `LanguageServers`, `RegistryListing`, `UntrackedVault`, `VaultPlace`, `CheckoutHead`, `RegisteredRepoStatus`, `CodexProcessGroupInspection`, `CodexProcessGroupSignal`. 21 names are held by packages this task must not edit (codex-app-server, workbench, renderer). Not reached: 45. The next cuts need restructuring of the server's repository routes and the CLI repo commands, and folding the code-binding snapshot's three Git lookups into `inspectCheckout`, whose branch reading differs (`--abbrev-ref` against `symbolic-ref`).
<!-- SECTION:NOTES:END -->

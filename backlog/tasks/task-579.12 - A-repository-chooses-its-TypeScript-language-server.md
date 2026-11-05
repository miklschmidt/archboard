---
id: TASK-579.12
title: A repository chooses its TypeScript language server
status: In Progress
assignee:
  - '@implementer'
created_date: '2026-11-05T15:15:00Z'
updated_date: '2026-11-05T15:34:00Z'
labels: []
dependencies: []
references:
  - >-
    packages/code-intel/src/runtime/operations/language-servers/server-command.ts
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
type: feature
ordinal: 1033000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code check runs the native `tsc --lsp --stdio` of TypeScript 7, from the checkout or from Archboard, and `repo language-server` refuses `typescript`. A release ships no TypeScript, and repositories use other servers: TypeScript before 7 has no `--lsp` (typescript-language-server wraps tsserver), and Rust ports such as oxc-project/tsrs and pingdotgg/ts-rust say they ship the same language server as TypeScript 7.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `archboard repo language-server typescript <command> [--arg ...]` configures the TypeScript server of a checkout, and `--remove` removes it
- [ ] #2 A configured TypeScript server wins; otherwise the checkout TypeScript 7 or later is used; otherwise the code check reports the server as missing with a remedy that names the command
- [ ] #3 A release looks for no TypeScript of its own, and a checkout keeps the fallback to Archboard's own TypeScript
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add typescript to CONFIGURABLE_LANGUAGES so LanguageServersSchema, repo language-server and the check name one shape. 2. languageServerOf: configured server wins; else checkout TS7 native tsc; else Archboard's own only when installation().mode is checkout; else missing with the configure command. 3. Update CLI description, INSTALL.md, consumer skill setup.md, ADR 0046 amendment. 4. Tests: server-command unit, CLI set/remove.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: the worktree started on main; fast-forwarded to fix/core-build-feedback to get the installation module. Decision: TypeScript joins CONFIGURABLE_LANGUAGES (one list) rather than a separate case; defaultTypescriptServer takes the fallback flag so release behaviour is testable without the installation singleton. Generated CLI contract artifacts did not change.
<!-- SECTION:NOTES:END -->

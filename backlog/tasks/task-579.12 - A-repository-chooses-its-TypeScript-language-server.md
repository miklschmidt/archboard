---
id: TASK-579.12
title: A repository chooses its TypeScript language server
status: To Do
assignee: []
created_date: '2026-11-05T15:15:00Z'
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

---
id: TASK-579.07
title: The compiled executable runs the CLI and the server from outside any checkout
status: To Do
assignee: []
created_date: '2026-11-05T14:59:00Z'
labels: []
dependencies:
  - TASK-579.01
  - TASK-579.02
  - TASK-579.05
references:
  - packages/server-lifecycle/src/runtime/operations/spawn.ts
  - packages/renderer/src/runtime/services/bun-host.ts
documentation:
  - docs/adr/0075-a-release-is-a-compiled-executable-for-each-platform-on-npm.md
parent_task_id: TASK-579
type: task
ordinal: 1028000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`bun build --compile` bundles the CLI, but the server is spawned as `bun apps/server/src/server.ts`, and about ten files load by path or `import.meta.resolve`: the layout worker, grammar and core WebAssembly, tree-sitter queries, voice and workbench text and JSON, and `theme.css` through the native lightningcss addon.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One executable runs the CLI, and with an internal first argument it runs the server
- [ ] #2 Every file read by path loads from the installation module or from the executable, and no native Node addon loads at runtime
- [ ] #3 From a directory outside any checkout, the executable with its assets runs `start`, `model read`, a render, `code check` and `stop`
<!-- AC:END -->

---
id: TASK-500.08
title: Codex protocol and process ownership are in the codex-app-server package
status: To Do
assignee: []
created_date: '2026-10-19 03:14'
labels: []
dependencies:
  - TASK-500.07
parent_task_id: TASK-500
ordinal: 873000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The runtime half of the codex-app-server package: runtime/codex-protocol (schemas and decoders) and the rest of runtime/codex-process (process owner, storage, executable resolution, diagnostics). The process group files already live in the process package. runtime/codex-process/lib/executable.ts:143 finds the checkout-local Codex executable by walking four parents up from its own file, which breaks at a package path. It must use SOURCE_CHECKOUT from @archboard/workspace/source-checkout and keep refusing a global or foreign-checkout executable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 codex-protocol and the remaining codex-process files live in packages/codex-app-server in runtime/ role folders, every importer uses the package exports, and no forwarding barrel is left
- [ ] #2 Executable resolution uses SOURCE_CHECKOUT and still refuses an executable of a global or foreign checkout, proven by its existing test
- [ ] #3 The tests of the moved code live in packages/codex-app-server/tests, and the normal and opt-in test paths in package.json and ci.yml name the new locations
- [ ] #4 bun run check passes
<!-- AC:END -->

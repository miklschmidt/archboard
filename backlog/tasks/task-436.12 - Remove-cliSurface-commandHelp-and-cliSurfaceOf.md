---
id: TASK-436.12
title: 'Remove cliSurface, commandHelp and cliSurfaceOf'
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-07 00:36'
updated_date: '2026-10-07 00:50'
labels:
  - cli
dependencies: []
parent_task_id: TASK-436
ordinal: 706000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`cliSurface` and `commandHelp` in `src/cli/commands/run.ts`, and `cliSurfaceOf` in `src/cli/command-routing/lib/registry.ts`, have no caller outside each other. The tests read the command table through `cliContractRegistry`, but `docs/agents/test-suite.md` still names `cliSurface()`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The three functions are gone, and `docs/agents/test-suite.md` names what the system tests use
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Use the Command dispatch@TASK-436.12 proposal prepared by the parent board owner (b1ee9682e): the existing registry part becomes Registry and exposes registryOf.
2. Delete cliSurface, commandHelp and cliSurfaceOf, their unused imports and exports; retain the command table and cliContractRegistry.
3. Correct docs/agents/test-suite.md to name cliContractRegistry.
4. Run the focused help and deterministic command-contract artifact owners, then simplify and commit this scope. Parent handles board adoption and finalization.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Removed the three unused helper functions and their imports/exports. docs/agents/test-suite.md now points to cliContractRegistry. Focused validation: bun test --isolate src/cli/command-routing/tests/help.test.ts tests/system/cli/command-contract-artifacts.test.ts — 11 pass, 0 fail. Removal sweep has no remaining code/current-doc mentions outside historical board variants and Backlog. Simplification pause: the direct deletion leaves one registry projection and existing help path; no replacement abstraction is needed. Parent owns board adoption and final acceptance.
<!-- SECTION:NOTES:END -->

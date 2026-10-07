---
id: TASK-436.13
title: The history lens reads a .csproj binding as the directory of its project
status: Done
assignee:
  - '@codex'
created_date: '2026-10-07 00:37'
updated_date: '2026-10-07 01:36'
labels:
  - history
dependencies: []
parent_task_id: TASK-436
ordinal: 707000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code check reads a part bound to a `.csproj` file as the whole directory of the project. The history lens matches only the `.csproj` file itself, so Behind, hotspots, change coupling and footprints miss commits that change only the `.cs` files of the project.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 For a part bound to a `.csproj` file, the history lens counts commits to every file in the directory of the project
- [x] #2 The code check and the history lens get the files of a binding from one function
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. No board is affected: code check and history lens already depend on shared/code-target, and the shared file selection changes no drawn module or relationship.
2. Put bindingPathOf and filesOfBinding in shared/code-target; a .csproj binding names its project directory and files are selected by exact or descendant path.
3. Make the code check and history mapping use that selection, preserving checkout/ref checks, ignored-file filtering, C-family pairs, and rename history.
4. Verify project source-only changes through Behind, hotspots, coupling and footprints, and retain the existing code-check project owner.
5. Simplify the resulting implementation, record validation and commit a TASK-436.13 checkpoint.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented bindingPathOf and filesOfBinding in shared/code-target. Code check and history now use one exact-or-descendant selection rule; history normalizes project scope before overlap/coupling. A focused Git owner verifies nested C# and project-settings-only changes through Behind, locality/coupling and footprint. Existing C# and C-family code-check owners pass. Validation: history-lens plus C#/C owners 46 tests passed; final focused project/C#/C run 9 passed; touched production/test lint and root tsc --noEmit passed. ensure:codex-contract cannot run in the dependency-symlink worktree because its checkout-local guard rejects the main node_modules path, so copied main ignored generated contract for focused type checks; integration gate remains on main. Simplified file selection and retained rename aliases as exact paths, so former .csproj names cannot expand unrelated history.

Final gate: bun run check exits 0 in 436 seconds. Modules: 4,353 passed. System: 196 passed. Repository policy: 24 passed. Serial browser: 24 passed across all nineteen lane commands. Lint, formatting, root and frontend types, and builds pass. Final runtime refresh succeeds, and dogfood check --code exits 0 with zero diagnostics and zero warnings. Simplification and focused regression evidence remain in the task notes. Complete log: /tmp/archboard-task436-final-check-2.log.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Code analysis and history share binding file selection. A csproj binding covers its entire project directory, including shared files. Focused project history tests and the complete gate pass.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: TASK-436.07
title: A header file takes its language from its paired source file
status: Done
assignee:
  - '@codex'
created_date: '2026-10-07 00:36'
updated_date: '2026-10-07 01:35'
labels:
  - code-check
dependencies: []
parent_task_id: TASK-436
ordinal: 755000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code check chooses the grammar of a `.h` file from the text of the header alone, because the facts of a file are cached by its own content. Two rare cases read incorrectly (TASK-367.10): an Objective-C header with only C functions, and a C++ header with `#ifdef __OBJC__ @class X;`. The owner decided that the paired source file decides.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A header with a source file of the same name in the same directory takes the language of that file. A header without one reads by its own text, as now
- [x] #2 A change to the header or to its paired file refreshes the cached facts of the header
- [x] #3 Both cases of TASK-367.10 read correctly, each with a test
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. No board is structurally affected: header grammar selection and cache freshness remain internal to Code facts.
2. Select a supported same-directory, same-stem source before the header text heuristic, using its C, C++ or Objective-C language.
3. Include paired-source content in header cache freshness, alongside header content and parser identity.
4. Verify the two TASK-367.10 header cases and refresh after editing either member of a pair; simplify and commit. Keep In Progress until the integrated gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented same-directory source selection for C-family headers, including forced Objective-C header role for .m pairs. A paired-source path/content hash participates in cache freshness. The two rare TASK-367.10 cases and cache refresh after both source and header edits pass; focused header/C/Objective-C/resolution owners: 25 pass, 0 fail. Simplification pass kept selection in the existing adapter table reading and freshness in the existing cache entry; no new module or board structure. Awaiting integrated gate.

Final gate: bun run check exits 0 in 436 seconds. Modules: 4,353 passed. System: 196 passed. Repository policy: 24 passed. Serial browser: 24 passed across all nineteen lane commands. Lint, formatting, root and frontend types, and builds pass. Final runtime refresh succeeds, and dogfood check --code exits 0 with zero diagnostics and zero warnings. Simplification and focused regression evidence remain in the task notes. Complete log: /tmp/archboard-task436-final-check-2.log.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Headers use the language of their paired source and refresh when either file changes. The two reported language cases and cache transitions pass focused tests and the complete gate.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: TASK-429
title: >-
  The first code-check run over a very large C or C++ checkout resolves its
  candidates
status: To Do
assignee: []
created_date: '2026-10-06 21:48'
updated_date: '2026-10-07 00:54'
labels:
  - code-check
dependencies: []
priority: low
ordinal: 692000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-367.15 made clangd build its background index again on every run of the code check. On the whole of LLVM, the index took 54 s, so each run failed after the 30 s limit and kept its candidates. TASK-433 changed this: clangd is a configured server and keeps its index in `.cache/clangd/index` of the checkout, as it does in an editor. On Redis, a first run took 4.6 to 4.8 s and a later run 1.9 to 2.0 s, against 3.1 s for every run before. So only a first run over a checkout whose full index takes longer than the limit is left. Nobody measured whether the index files that clangd writes before the check stops it let the next run finish. If they do, this task is not needed. Indexing only the files of bound parts limits the time by the board, not the checkout, but it changes answers: an anchor defined in code that no part binds reads as its declaration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A measurement on LLVM, or another checkout whose index takes longer than the limit, says whether the second run of the code check finishes with the index that the first run left
- [ ] #2 If the second run does not finish, a run over such a checkout resolves the candidates of its bound parts
- [ ] #3 A later run on Redis takes no longer than 2.0 s
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-436.02 removes the first-run 30-second language-server/index deadline. A requested check now waits until the full index finishes or its caller cancels/server exits, so this workaround is no longer needed. Archived by the explicit TASK-436.02 acceptance criterion.
<!-- SECTION:NOTES:END -->

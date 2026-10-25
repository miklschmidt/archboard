---
id: TASK-539.01
title: The code pass remembers what each bound module exposes, and what it skipped
status: To Do
assignee: []
created_date: '2026-10-25T17:04:00Z'
labels:
  - code-check
dependencies: []
parent_task_id: TASK-539
type: feature
ordinal: 933000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A code pass reads each bound module (`module-reading.ts`) and drops the reading when it returns. The server remembers only the findings of each board, and it drops what the pass skipped (`code-findings-memory.ts`). A pane can then show neither the names nor how complete the reading is. TASK-537.06 needs the same memory, so this change lands once for both.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 For each judged container, the remembered pass holds its module, root files, the exact count of exposed names and of names used outside, and each name with its file, its line, the files that pass it on, and its outside users with the part that holds each user
- [ ] #2 The number of exposed names minus the names used outside equals the number of names that EXPOSED_UNUSED lists for the same container
- [ ] #3 Long lists are capped with exact counts beside them
- [ ] #4 Each remembered board reading carries the skips of that board and the skips that name no board
- [ ] #5 A route answers one container from memory only and never starts a pass
- [ ] #6 Without an opt-in, the answer of archboard check --code is unchanged
- [ ] #7 A reading quotes symbols, paths and lines only, never other text of a file (ADR 0046)
<!-- AC:END -->

---
id: TASK-537.06
title: Design questions include what the last code pass found
status: To Do
assignee: []
created_date: '2026-10-25T17:05:00Z'
labels:
  - design-questions
  - code-check
dependencies:
  - TASK-537.05
  - TASK-539.01
  - TASK-539.05
parent_task_id: TASK-537
type: feature
ordinal: 940000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The code check finds callers and tests that reach private code, and exposed names that nobody outside a module uses. A person reads them today only in a terminal. Two other findings, CALLER_UNDRAWN and RELATIONSHIP_UNDRAWN, say that a board misses a drawing, not that the code leaks, so they stay a question of their own.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ENTRY_POINT_UNEXPOSED, TEST_IMPORT_UNEXPOSED and EXPOSED_UNUSED from the last remembered code pass form questions
- [ ] #2 CALLER_UNDRAWN and RELATIONSHIP_UNDRAWN form a separate question about what the board does not draw
- [ ] #3 Each question from the code pass shows when the pass ran, and a board with no pass, or whose pass read an older version, is listed as not read
- [ ] #4 Reading the questions never starts a code pass, and archboard semantic questions gives the same questions
<!-- AC:END -->

---
id: TASK-385.04
title: Pane news redraws only the navigator rows it changes
status: Done
assignee:
  - '@claude'
created_date: '2026-10-01 10:24'
updated_date: '2026-10-01 10:30'
labels:
  - frontend
  - performance
dependencies: []
parent_task_id: TASK-385
priority: medium
type: bug
ordinal: 668000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A claim, an agent's activity or a pane status lands in the pane records at the application root, which renders the Shell again. The Navigator then makes every row object again from the shell view (navigatorRows over paneMarks and agentActivity), so every OutlineRow, TreeRow and BoardLine renders, although the news concerns one board. Measured on 2026-10-01 with the probe: a claim and its release rendered OutlineRow and TreeRow 30 times each, which is every row on every root render. Follow-up to TASK-385.03, approved by the user.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 News about one board renders the navigator rows of that board and no other row
- [x] #2 The navigator shows the same pane marks, activity and claims as before
- [x] #3 A test at the shell module's entrypoint fails when news about one board renders another board's row
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Root: the shell actions read the panes through a live view (livePanesOver over a LiveBinding), and useBesideOpening reads it when it acts. So the actions keep one identity through pane news.
2. Navigator: keep the pane marks (useKept, compared with sameData) while they say the same. The rows, their expansion and their handlers are then not made again for news that does not change them.
3. OutlineRow is memoized with a comparison by value of its row and by identity of its handlers. BoardOutline's key handler reads the rows when a key is pressed, so it keeps one identity.
4. Test at the shell entrypoint (navigator-tree.test.tsx): mount Shell, show a claim, then show one board's activity, and read each row element's props through React's __reactProps$ key.
5. Board proposals: none. The shell's internals are not drawn.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The test is red without the fix: a claim redrew all 9 rows. It is green with the fix: a claim redraws no row, and activity on Audit redraws only board:audit.
Probe, claim and release in the real page: 1356 component renders became 964, and OutlineRow and TreeRow no longer render. The 3 remaining stage renders come from the claim banner resizing the stage, because the camera room is React state in the stage.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The navigator draws a row again only when the row says something new. The shell actions read the panes through a live view, so they keep one identity. The navigator keeps its pane marks while they are the same, OutlineRow is memoized by its row's value, and the key handler reads the rows when pressed. A claim now redraws no row, and one board's activity redraws that board's row only. Verified by a test at the shell entrypoint that was red before (9 rows), and by the probe (1356 renders became 964 for a claim and release).
<!-- SECTION:FINAL_SUMMARY:END -->

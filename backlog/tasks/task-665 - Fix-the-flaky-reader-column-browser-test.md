---
id: TASK-665
title: Fix the flaky reader-column browser test
status: Done
assignee:
  - '@claude'
created_date: '2026-11-22T13:35:00Z'
updated_date: '2026-11-22T14:01:00Z'
labels:
  - bug
dependencies: []
ordinal: 1153000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/system/browser/reader-column.test.ts ("Code shows the focused pane's addressed file…") fails about 1 run in 6 with "Wait timed out after 25000ms", with or without the 2026-11-22 toast-scroll fix. Flakes cost CI reruns and hide real failures.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The root cause is named with file and line evidence
- [x] #2 The test passes 100 repeated runs under parallel load
- [x] #3 No timeout is raised and no retry is added to hide it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce under parallel load (16 lane runners at once) and log the handle position, ResizeObserver sizes and data-sliding in the page from the focus change to the drag.
2. Fix where the evidence points: the drag must start only once the code column has arrived.
3. Show 100+ repeated runs passing under the same load.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence, 2026-11-22. Each failing run stops in the 25 s agent-browser wait for Architecture to be pressed after the drag (9 of 11 expects done). An in-page log showed the handle measured at x 422, 734 and 787 in the failing runs against 841 or 981 at rest: the code column was still opening from the Code click (reader-column.test.ts:417). The press arrives about 130 ms after the measurement, the handle has moved right by then, and pointerdown lands on code-lines instead of the separator, so nothing collapses. The waits between the Code click and the drag (showsFile, focus) watch only the content, which ColumnSlide mounts at the start of the slide (SideColumn.tsx:113). The slide lasts 220 ms (COLUMN_MS.agentPanelSlide) plus its ease; under load frames come about 200 ms apart and the whole run from Code to drag takes 160 to 360 ms. In one failing run data-sliding was already cleared by its timer (SideColumn.tsx:127-138) while the column still stood at 313 px, so the wait also checks the column's running animations.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The reader-column test dragged the code view's handle before the column had finished sliding open, so under load the press landed on the code text and the column never closed.

Cause: the test clicks Code and then waits only for the panes' files, which the column mounts at the start of its 220 ms slide. Under parallel load the run reaches the drag in 160 to 360 ms and measures the handle mid-slide (x 422 to 787 instead of 841); about 130 ms later the handle has moved and the press misses it. The product behaves as designed: a person does not grab a column that is still arriving.

Fix: the test waits until no column is sliding and the code view has no running animation before it measures the handle. No timeout, retry or skip.

Verification at 16 lane runners at once: before, 6 of 112 runs failed with Wait timed out after 25000ms; after, 112 of 112 passed.

Noticed, not fixed: SideColumn's slide ends by a timer (columnSlideSettledMs), so under heavy load data-sliding clears while the column is still mid-way and the column then jumps to its width.
<!-- SECTION:FINAL_SUMMARY:END -->

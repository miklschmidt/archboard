---
id: TASK-241
title: >-
  Layout rule hygiene: cycle breaking test, face tie-break test, bridging in the
  layout owner
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 21:27'
updated_date: '2026-09-15 21:58'
labels:
  - renderer
dependencies: []
references:
  - docs/design/layout-rules.md
ordinal: 412000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/design/layout-rules.md recommendation 7: cycle breaking in rank.ts has no direct test; previousSides breaks face ties by array order with no test; bridging runs in the painter so layoutCompound returns curves that are not the painted ones.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A rank test holds which edge of a cycle is dropped and that document order decides it
- [x] #2 A test holds the previousSides tie-break
- [x] #3 layoutCompound returns the bridged curves the painter draws
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. rank.test.ts: cycle broken from the first part in document order. 2. Comment and a test on inherited faces (a tie is impossible for a port on a face). 3. PaintedDrawing: layoutCompound returns bridged routes beside the un-bridged ones.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Renderer and server suites pass (421). The tie-break itself cannot be reached from content since a port lies on a face; the test holds the behaviour the tie-break serves (a surviving relationship keeps its predecessor faces) and the code says why ties do not occur.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Cycle breaking and inherited faces tested, bridging settled in the layout owner; verified by the renderer suite.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: TASK-561
title: Reduce the viewer's dependency on the DOM once Vello paints the canvas
status: To Do
assignee: []
created_date: '2026-11-01T03:48:00Z'
labels:
  - frontend
dependencies:
  - TASK-560
references:
  - >-
    docs/adr/0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
  - docs/design/typed-scene.md
type: task
ordinal: 1010000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The design of TASK-560 keeps a hidden SVG in the page after Vello paints the canvas. That layer keeps search, copy and screen readers working. It also keeps the viewer and its tests working, because about 110 test files and much of the viewer read the picture's DOM. TASK-560 keeps that layer to limit the size of its change, not because the product needs all of it.

This has three costs. A viewer that reads subjects and state back from the DOM has two sources of truth, the painter and the page, and these can disagree during a transition. A native frontend such as GPUI has no DOM, so logic that reads the DOM cannot move there. The browser still lays out the hidden SVG: TASK-405 measured about 5 ms of SVG text layout on each zoom frame.

Start this task only after TASK-560 merges, and measure from what it actually left in the page.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Viewer logic gets subjects, selection, light and camera state from the painter and the scene, and no viewer logic reads them back from the picture's DOM
- [ ] #2 The picture's DOM holds only what search, copy, screen readers and keyboard focus need
- [ ] #3 Search, copy, screen readers and keyboard keep the behavior that they have after TASK-560
- [ ] #4 Tests of picture behavior read painter state or pick results, and only tests of search, copy, screen readers and keyboard read the picture's DOM
- [ ] #5 The notes record the picture's DOM element count and the scroll zoom frame time on a large board, before and after, with the method of TASK-405. The element count is lower and the frame time is not higher
- [ ] #6 bun run check passes
<!-- AC:END -->

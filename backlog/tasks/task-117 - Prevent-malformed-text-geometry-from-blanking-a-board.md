---
id: TASK-117
title: Prevent malformed text geometry from blanking a board
status: To Do
assignee: []
created_date: '2026-08-25 11:34'
labels: []
dependencies: []
references:
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - src/core/expand-elements.ts
  - frontend/src/canvas/useCanvasSession.ts
priority: high
type: bug
ordinal: 119000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A board can persist an auto-resizing Helvetica text element without finite width and height. Excalidraw then computes a non-finite camera state, the pane report serializes it as null, POST /api/panes returns 400, zoom displays %NaN%, and the board does not render. Reject malformed write input before it reaches a note, and make legacy malformed notes fail visibly without corrupting pane telemetry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An auto-resizing text element in an unmeasurable font with no finite width or height is refused atomically with an error that identifies the element and invalid fields
- [ ] #2 No successful write can persist an element whose required render geometry is missing or non-finite
- [ ] #3 Opening a legacy note with malformed geometry shows an actionable board error instead of a blank canvas or %NaN% zoom
- [ ] #4 Pane reports never send non-finite viewport values as null, and a failed pane report can recover after the underlying scene is corrected
- [ ] #5 The 400 response for invalid pane telemetry identifies the failing field path
- [ ] #6 Regression coverage reproduces the Helvetica missing-dimensions case and proves finite zoom, a rendered board or explicit board error, and successful pane registration
<!-- AC:END -->

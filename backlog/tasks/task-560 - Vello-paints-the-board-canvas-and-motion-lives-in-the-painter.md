---
id: TASK-560
title: Vello paints the board canvas, and motion lives in the painter
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-01T03:41:00Z'
labels: []
dependencies: []
documentation:
  - >-
    docs/adr/0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
  - docs/design/typed-scene.md
ordinal: 1009000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants smoother animations and transitions in the canvas. A browser pane shows a server-drawn SVG, and every moment of motion is DOM work over it. The typed scene (TASK-520.10) lets a frontend paint without SVG or CSS, and ADR 0059 names Vello for a native frontend. This task makes Vello the default painter of the browser canvas, moves motion into the painter as pure functions of typed scenes, and keeps SVG for exports. It changes the clause of ADR 0059 that the browser viewer keeps its classes and Web Animations over the SVG.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Vello paints the browser canvas by default and the painter in use can be inspected
- [ ] #2 A person with no WebGPU adapter sees a correct board, chosen by a deterministic rule that a real run measured
- [ ] #3 No SVG DOM motion remains in the browser viewer, and SVG stays for exports, PNGs and README assets
- [ ] #4 Search, copy, screen readers, keyboard and picking keep the behavior that the page has now
- [ ] #5 bun run check passes
<!-- AC:END -->

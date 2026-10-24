---
id: TASK-520
title: The renderer is a Rust core that every frontend paints
status: To Do
assignee: []
created_date: '2026-10-24 12:53'
labels:
  - renderer
  - performance
dependencies: []
documentation:
  - >-
    docs/adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-paint-list.md
priority: high
ordinal: 920000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A native desktop frontend (GPUI with Vello, later) cannot draw today's pictures: the SVG the renderer writes is a live browser document that SMIL, CSS transitions and the viewer's classes animate, so only a browser draws it faithfully. libavoid, which routes the trunks of Blocks, is the largest single cost of a render (TASK-512, docs/design/layout-rules.md). Text is measured by the canvas of the place that draws, so a picture depends on which fonts load where it is shown. ADR 0057 records the decision: the renderer becomes a Rust crate compiled to WASM for Bun and the browser and linked natively by a native frontend, its output is a paint list that each frontend paints, it routes with its own router and it shapes text into glyph runs. The elk-rs port (layout-rules.md section 23) is the precedent for porting with an oracle. GPUI experiments come after this task and are not part of it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Bun and the browser render every board through the same WASM build of the Rust core, and no TypeScript layout or painting rules remain in packages/renderer
- [ ] #2 Each port step leaves every corpus picture the same bytes, except the router and text steps, whose pictures are no worse on the measures of ADR 0039
- [ ] #3 A native Rust program links the core and gets the paint list of a board without a JavaScript engine
- [ ] #4 The development tools come from the Nix flake of the repository
<!-- AC:END -->

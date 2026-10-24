---
id: TASK-520.03
title: The core paints a drawing into a scene and writes its SVG
status: In Progress
assignee:
  - '@claude'
created_date: 2026-10-24 12:53
updated_date: '2026-10-24T15:15:00Z'
labels:
  - renderer
dependencies:
  - TASK-520.01
documentation:
  - >-
    docs/adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
parent_task_id: TASK-520
priority: high
ordinal: 923000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The port starts at the output, so a native frontend can read a scene from the server while layout is still TypeScript. The drawing geometry that layout answers (shared/rules/render/drawing.ts and the sequence and flowchart drawings) becomes the input contract of the core. The SVG bytes that the TypeScript painter writes today are the oracle. The corpus is every board whole, every view and every non-current variant of the dogfood vault and the vaults under examples/, under both engines and both themes, with and without the comparison.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The core turns the drawing of an architecture, a sequence and a flowchart into a scene, and writes SVG from the scene
- [ ] #2 Every corpus picture is the same bytes as the picture that the TypeScript painter wrote before the change
- [ ] #3 Each group of the scene names the subject it draws and its role, and traffic is data on the scene, not SMIL
- [ ] #4 The TypeScript types of the scene are generated from its Rust types
- [ ] #5 The TypeScript painter under shared/rules/svg is gone, and the browser lane passes unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Record the corpus baseline (full, all variants) and a current-variant SVG baseline before any change.
2. crates/archboard-scene: the drawing contract (geometry, curves, fonts, text runs, the architecture drawing generic over node and edge facts, the sequence drawing, the paint request), the scene (groups with subject and role, elements, text, traffic marks as data), ECMAScript number formatting (ryu-js, exact toFixed, Math.round, JSC hypot), and the painter (drawing -> scene) ported from shared/rules/svg. Text is measured through a host Measure trait (the canvas of the place that draws, until TASK-520.07).
3. crates/archboard-svg: the SVG writer (scene -> document): stylesheet, markers and shared definitions, standalone theme tokens, traffic written as SMIL.
4. Generated TypeScript: a ts-rs exporter writes the contract and scene types into the ignored core build directory; build-core runs it; drawing.ts, geometry.ts, curves.ts and fonts.ts re-export them.
5. crates/archboard-renderer-wasm/src/scene.rs: paint (request + measure callback -> SVG and atlas) and paintScene.
6. TS hand-off: render/diagram.ts and flowchart.ts lay out as before and hand the drawing to the core; Bun loads the core before the first paint (refusing a stale build), the browser tab initializes the glue in startBrowserRenderer.
7. A differential harness renders every corpus job through both painters until they agree; then compare against the recorded baseline (0 differing drawings, --variants all).
8. Delete shared/rules/svg and what only served it; keep the picture key, inks, drill direction and code-finding marks apps/web reads; port the painter's unit tests to Rust.
9. Board proposal on Semantic renderer (Painting module), docs, gate.
<!-- SECTION:PLAN:END -->

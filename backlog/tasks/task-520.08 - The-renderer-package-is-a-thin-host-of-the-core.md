---
id: TASK-520.08
title: The renderer package is a thin host of the core
status: To Do
assignee: []
created_date: '2026-10-24 12:54'
updated_date: '2026-10-24 14:34'
labels:
  - renderer
dependencies:
  - TASK-520.07
documentation:
  - >-
    docs/adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
parent_task_id: TASK-520
ordinal: 928000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the layout, painting and text ports, the renderer package still holds the TypeScript that turns a board and its policy into a drawing request (shared/rules/render: shown, appearance, step lines, the render reply). This task moves what remains into the core, so a native frontend gets a scene from board content alone, and leaves the package as the host that loads the core, gives it Graphviz and the icons, and runs the rasterizer.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The core takes the content, the policy and the render choices of a board and answers the render reply with its scene and SVG
- [ ] #2 A cargo test renders a corpus board natively to the same SVG bytes as the WASM build
- [ ] #3 packages/renderer holds no layout, painting or measurement rules in TypeScript
- [ ] #4 The Semantic renderer and Renderer layout boards draw the core as built
<!-- AC:END -->

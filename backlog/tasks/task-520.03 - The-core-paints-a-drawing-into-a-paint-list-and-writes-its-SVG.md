---
id: TASK-520.03
title: The core paints a drawing into a scene and writes its SVG
status: To Do
assignee: []
created_date: '2026-10-24 12:53'
updated_date: '2026-10-24 14:34'
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

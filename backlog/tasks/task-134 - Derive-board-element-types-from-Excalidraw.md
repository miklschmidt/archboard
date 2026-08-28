---
id: TASK-134
title: Derive board element types from Excalidraw
status: To Do
assignee: []
created_date: '2026-08-28 14:02'
updated_date: '2026-08-28 14:07'
labels: []
dependencies: []
references:
  - src/runtime/engine/types.ts
  - src/runtime/engine/apply-element-input.ts
  - src/ui/types/index.ts
  - src/ui/canvas/elements.ts
  - docs/agents/boundaries.md
priority: high
type: enhancement
ordinal: 150000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace Archboard's handwritten copies of Excalidraw element structures with types derived from the pinned @excalidraw/excalidraw exports. Today ServerElement and the UI transport type combine vendor fields, agent input spellings, and Archboard metadata, so an Excalidraw upgrade can change the native format without forcing the compiler to identify every incompatible assumption. Split those concepts at the applyElementInput seam and make the dependency's types authoritative for board data.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The canonical persisted board element type derives from the pinned Excalidraw element union, narrowed only to the element kinds Archboard supports.
- [ ] #2 Agent input spellings and Archboard metadata have separate local types and cannot appear in persisted board elements unless they are also native Excalidraw fields.
- [ ] #3 The UI and runtime no longer maintain separate handwritten copies of native Excalidraw element fields.
- [ ] #4 A stable type or repository-policy check fails when a handwritten native Excalidraw element structure is reintroduced.
- [ ] #5 Type-checking and the complete fixed-point, browser, and board test chain pass against the pinned Excalidraw version.
<!-- AC:END -->

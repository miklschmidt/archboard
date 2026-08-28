---
id: TASK-090
title: Differential-check human arrow bindings against pinned Excalidraw
status: To Do
assignee: []
created_date: '2026-08-21 13:36'
updated_date: '2026-08-28 00:35'
labels: []
dependencies: []
references:
  - src/runtime/engine/arrow-binding.ts
  - scripts/check-fixed-point.mjs
  - scripts/check-geometry.mjs
  - package.json
priority: high
type: task
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The original claim that nothing detects Excalidraw drift is stale. @excalidraw/excalidraw is pinned to 0.18.1, check-fixed-point renders the converted board in the real browser, text geometry is compared there, and the current fixture returns zero changes.

One important gap remains. The browser fixture covers agent-created centered bindings, while a person can rebind an arrow end with nonzero focus and gap. That stored binding is later interpreted by arrow-binding.ts when an agent moves the attached node. Add a small browser differential for that ordinary collaboration path. Keep the current port unless the differential exposes a visible mismatch. Do not vendor Excalidraw internals or build source-map extraction machinery for a discrepancy the browser cannot show.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The pinned Excalidraw version and the decision to keep the local arrow-binding port are recorded with the browser differential that guards the decision.
- [ ] #2 A real browser creates or adopts an arrow end with nonzero focus and gap, an agent moves the bound node, and the check compares the server result with the endpoint Excalidraw settles on.
- [ ] #3 The fixture includes the existing human-shaped case of focus 0.9 and gap 15 on a normal architecture node, with a stated visible tolerance and actionable mismatch output.
- [ ] #4 The upgrade note names the focused geometry and fixed-point checks to run when @excalidraw/excalidraw changes.
- [ ] #5 No vendored Excalidraw geometry, source-map extractor, or second binding implementation is added unless the differential first proves the current implementation visibly wrong.
<!-- AC:END -->

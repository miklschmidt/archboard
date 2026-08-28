---
id: TASK-090
title: Differential-check human arrow bindings against pinned Excalidraw
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-21 13:36'
updated_date: '2026-08-28 00:45'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Extend scripts/check-fixed-point.mjs with one focused differential in the existing single headless-browser lane. Seed the same ordinary collaboration case already covered server-side: one normal 200 by 100 rectangle and one two-point arrow whose human-origin endBinding records focus 0.9, gap 15, and fixedPoint null. Have the real Excalidraw scene adopt that binding, then move the bound rectangle through the agent PUT route so archboard reroutes the arrow.
2. Capture the canonical server arrow after the move, wait for the real Excalidraw scene to stop changing, and compare the bound endpoint in board coordinates. Accept at most 1.0 px Euclidean separation. One scene pixel is below the visible displacement this task is guarding, while the existing centered alternative is more than 10 px away. A failure must print the server and browser endpoints, dx, dy, total separation, focus, gap, and moved node geometry so an Excalidraw upgrade or local-port mismatch is actionable.
3. Keep src/runtime/engine/arrow-binding.ts and scripts/check-geometry.mjs unchanged if the differential passes. The existing geometry check already proves focus 0.9 and gap 15 survive the human report and reroute when the node moves. If the browser separation exceeds 1.0 px, stop with the measured evidence and seek a plan amendment before changing the local binding port.
4. Update docs/agents/test-suite.md beside the fixed-point check to record that @excalidraw/excalidraw is pinned at 0.18.1, that the passing browser differential is the reason the local port remains, and that an Excalidraw upgrade must run bun run test:geometry followed by bun run test:browser.
5. Validate the approved change with bun run type-check and bun run test:geometry. Ask the parent before running bun run test:browser so the browser lane remains serial. Commit only scripts/check-fixed-point.mjs, docs/agents/test-suite.md, and the TASK-090 Backlog update with a conventional commit and what/why/how body. Leave every acceptance criterion unchecked and keep TASK-090 In Progress for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the approved single-browser differential in scripts/check-fixed-point.mjs and documented the Excalidraw 0.18.1 upgrade gate in docs/agents/test-suite.md. The fixture uses the existing focus 0.9, gap 15 human binding, moves its 200 by 100 rectangle through the agent PUT route, and reports server and browser endpoints, dx, dy, Euclidean separation, binding values, and node geometry against the 1.0 scene-pixel tolerance. Non-browser validation passed: bun run type-check and bun run test:geometry with 89 checks. test:browser remains pending because TASK-096 owns the browser lane.
<!-- SECTION:NOTES:END -->

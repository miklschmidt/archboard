---
id: TASK-090
title: Differential-check human arrow bindings against pinned Excalidraw
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-21 13:36'
updated_date: '2026-08-28 01:12'
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
1. Replace the current post-PUT read-back in scripts/check-fixed-point.mjs. Keep the adopted focus 0.9, gap 15 fixture in the fixed-point board, and copy its exact pre-move node geometry, two arrow endpoints, and binding into a small server-only comparison board. Assert the browser fixture and server-only fixture start with identical node geometry, arrow start and end points, and binding values.
2. Reuse the trusted interaction already exercised by scripts/check-human-edit-performance.mjs: frame human-node through POST /api/viewport, derive its screen center from the real Excalidraw app state, and drag that center with agent-browser mouse input. Install a focused window.fetch gate for the one POST /api/elements/changes report before the drag. The gate holds the request itself, so neither a server write, a notification delta, nor a correction response can supply a rerouted arrow before the oracle scene is read. Do not call updateScene with elements and do not send the arrow through an Archboard element API during this browser move.
3. Immediately after mouse-up, read the real Excalidraw scene and capture the browser-moved node geometry plus both absolute arrow endpoints. Prove the targeted node moved, focus 0.9 and gap 15 survived, the unbound arrow start stayed at its pre-move point, and the bound end changed. Then release the held human report and restore window.fetch so the existing fixed-point workflow can settle normally.
4. Move only the node on the server-only board through the agent PUT route, using the exact x and y captured from the browser drag. Before comparing endpoints, assert that both paths had the same pre-move node rectangle and arrow endpoints, and now have the same target node x, y, width, height, and angle plus the same unbound arrow start and binding. This makes the bound endpoint the only value under comparison. Compare the independently computed browser endpoint with the server endpoint at the approved 1.0 scene-pixel Euclidean tolerance. Do not import or call src/runtime/engine/arrow-binding.ts from the browser oracle.
5. Use one focused endpoint-comparison function for the real assertion and a pure negative control. Feed that same function a deliberately wrong server point two scene pixels to the right of the captured browser point and assert that it fails the 1.0 pixel gate. The negative control performs no API call, scene update, or note write.
6. Correct docs/agents/test-suite.md to say that trusted browser pointer input computes the oracle while its report is held, and that a separate server-only agent move from identical geometry is the value compared. Retain the Excalidraw 0.18.1 pin, the 1.0 pixel policy, mismatch evidence, and the test:geometry then test:browser upgrade sequence.
7. Keep src/runtime/engine/arrow-binding.ts and scripts/check-geometry.mjs unchanged. Validate with bun run type-check and bun run test:geometry, then request the serialized browser lane for bun run test:browser. Commit only scripts/check-fixed-point.mjs, docs/agents/test-suite.md, and the TASK-090 Backlog update. Leave TASK-090 In Progress with acceptance criteria unchecked for rereview.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the approved single-browser differential in scripts/check-fixed-point.mjs and documented the Excalidraw 0.18.1 upgrade gate in docs/agents/test-suite.md. The fixture uses the existing focus 0.9, gap 15 human binding, moves its 200 by 100 rectangle through the agent PUT route, and reports server and browser endpoints, dx, dy, Euclidean separation, binding values, and node geometry against the 1.0 scene-pixel tolerance. Non-browser validation passed: bun run type-check and bun run test:geometry with 89 checks. test:browser remains pending because TASK-096 owns the browser lane.

Independent review rejected the first browser assertion at commit 96b8cb9. The agent PUT rerouted both human-node and human-arrow on the server, notificationDelta sent both, and Excalidraw updateScene installed that already-rerouted arrow. The observed zero-pixel separation therefore did not provide an independent browser calculation and does not satisfy AC #2. No production binding code changed. The revised plan gates the browser change-report request before it reaches the server, captures the endpoint produced by trusted Excalidraw pointer input, and compares it with an agent PUT on a separate server-only board seeded from identical pre-move geometry.

Implemented the approved remediation: the fixed-point browser check now gates the human change report before the server, captures the endpoint produced by a trusted Excalidraw pointer drag, and compares it with an agent-only node move on an unopened board seeded from the same canonical geometry. The same 1.0 scene-pixel comparator rejects a purely in-memory endpoint shifted by 2 pixels. Production arrow binding, the geometry check, and UI remain unchanged. Non-browser validation passed at this revision: bun run type-check; bun run test:geometry (89 checks). test:browser is pending release of the serialized browser lane from TASK-096.
<!-- SECTION:NOTES:END -->

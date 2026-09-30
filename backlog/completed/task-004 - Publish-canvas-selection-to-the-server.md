---
id: TASK-004
title: Publish canvas selection to the server
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 14:49'
updated_date: '2026-08-19 15:22'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 4000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Frontend sends appState.selectedElementIds alongside element sync
- [x] #2 Server models current selection and exposes it via CLI and MCP
- [x] #3 Selection updates are visible to the agent without a full element sync
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Channel: dedicated lightweight selection endpoint, not the element sync. Frontend POSTs {selectedElementIds, clientId} to POST /api/selection; body is ids only (tens of bytes), independent of the 1200ms element sync. Chattiness: onChange -> compare id set to last posted -> only schedule if changed -> 150ms trailing debounce, so a lasso drag coalesces into one POST when the pointer settles. Selection changes are also not gated on userInteracted/isConnected the way element sync is.
2. Server state: selectionState in src/types.ts ({elementIds, clientId, at}) alongside elements/files/snapshots. POST /api/selection sets it, GET /api/selection reads it enriched. Broadcast a selection_changed WS message so a later event feed / second pane can subscribe without polling.
3. Multi-tab: one canvas, one selection, last writer wins. Each tab mints a clientId, passes it as a ?clientId= query param on the WS connect and in every POST. On WS close, if the closing client owns the current selection, the server clears it — so a closed or reloaded tab cannot leave a stale selection standing. GET reports clientId + at + connected client count so an agent can see whose selection it is and how old.
4. Reuse describe.ts rather than duplicating node detection: factor out the bound-text folding into a helper and export summariseElements(ids, allElements) built on the existing readMeta, returning {id, type, label, isNode, kind, binding, variant, level, fromBoard, geometry}. Also export describeSelection() for the narratable text form.
5. Surfaces: canvas-client.getSelection(); new src/cli/commands/selection.ts registered in cli/run.ts (JSON out, with a summary line); MCP tool get_selection in mcp-tools.ts + a dispatch case returning the narratable text.
6. Verify behaviourally: bunx tsc + bunx vite build, restart canvas, drive real Chrome — click and lasso elements on the actual canvas, read back over CLI and MCP, then deselect and confirm it clears; also confirm close-tab clears. Run bun run test. Leave canvas cleared and tab closed.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented and verified behaviourally in Chrome.

Channel: dedicated POST /api/selection carrying {elementIds, clientId} — ids only, so the payload is independent of scene size and never rides the 1200ms element sync. GET /api/selection resolves those ids against the scene the server already holds, so reading selection never re-transmits elements. A selection_changed WS message is broadcast on every change, for a later event feed / second pane.

Chattiness: frontend keeps the last-published id set and returns immediately from onChange when it is unchanged (measured: dragging a selected element = 0 selection POSTs despite continuous onChange), plus a 150ms trailing debounce so a lasso coalesces (measured: a full lasso drag = 2 POSTs — one clearing the previous selection at drag start, one for the result). Measured a click: selection lands at +747ms, the element sync at +1747ms, on separate endpoints.

Multi-tab: one canvas, one selection, last writer wins. Each tab mints a clientId, sends it on the WS connect (?clientId=) and with every post; GET reports clientId/at/browserClients. Verified: opening a second tab does not clobber tab 1 (no empty post on mount), selecting in tab 2 takes ownership, and closing tab 2 clears the selection it owned. Canvas clear also clears selection; ids no longer on the canvas surface as missingIds.

Reuse: extracted foldBoundText/toItem from describeScene, so buildSelectionReport uses the same node detection, bound-label folding and nodeLine/plainLine rendering. Removed the never-written sceneState.selectedElements; get_resource scene now reports the real selection.

Surfaces: ./bin/canvas selection [--text] (new src/cli/commands/selection.ts) and MCP get_selection; both verified against a real click/lasso and both clear on deselect. bun run test passes (5 stdio wire checks + bind check). Documented in skills/excalidraw-skill/SKILL.md (command table + 'Act on What the Human Selected'), synced.

Canvas left cleared, browser tab closed.

Orchestrator verification with real clicks in Chrome: clicking a node's stroke published it within ~2s and CLI reported '1 element selected: 1 node (service(1)) - AuthService' with binding and geometry; shift-clicking a plain box gave '1 node ... and 1 plain element', with the JSON carrying isNode true/false and kind - exactly the shape TASK-005 needs; clicking empty canvas cleared it. GET /api/selection returns the resolved report without re-transmitting the scene. bun run test green, tsc and vite build clean.

Methodology note worth keeping: clicking the INTERIOR of a shape with backgroundColor transparent selects nothing - Excalidraw only hit-tests the stroke. Cost me three false negatives here, and it has real UX consequences on a touchscreen for TASK-005. Filed as TASK-009.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Selection now reaches the server over a dedicated POST /api/selection channel carrying only element ids, deduped and debounced at 150ms, with a selection_changed WS broadcast. GET resolves ids against the scene the server already holds, so reading never re-transmits elements. Multi-tab is last-writer-wins with clientId ownership, dropped when the owning socket closes. Surfaced as CLI 'selection [--text]' and MCP get_selection, reusing describe's node detection and label folding. Verified with real browser clicks.
<!-- SECTION:FINAL_SUMMARY:END -->

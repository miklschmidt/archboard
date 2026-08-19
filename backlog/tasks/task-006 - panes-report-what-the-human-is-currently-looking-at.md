---
id: TASK-006
title: 'panes: report what the human is currently looking at'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 14:50'
updated_date: '2026-08-19 19:24'
labels:
  - needs-triage
dependencies:
  - TASK-016
ordinal: 6000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Reports which board and variant occupies which pane
- [x] #2 Includes current selection per pane
- [x] #3 Returns view state only, never board contents
- [x] #4 Cheap enough to call on every turn for spatial deixis resolution
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
DECISION: reporting only; per-pane board addressing is a follow-up.

Reasoning: independent addressing changes AUTHORITY, not reporting. Today activeBoard() is what every board-blind caller means (add, describe, clear, promote, board save, ~30 endpoints, every CLI/MCP tool). Giving panes their own board makes 'the board' ambiguous for all of them and forces a separate decision about what an unqualified add targets. That is its own design. Meanwhile panes is useful today even with one board shown twice: two panes can be scrolled to different regions and hold different selections, so left/right + viewport + per-pane selection already resolve deixis. The shape does not change later because each pane reports the board IT adopted (boardKeyRef), never activeBoardKey() — the day pane 2 can adopt a different board, the same field just carries a different value.

1. Server: pane registry keyed by clientId (src/core/panes.ts + Map in server.ts). A pane POSTs /api/panes with its own board key/identity, page rect, scene viewport, focus, primary, elementCount. Registration is dropped on ws close for that clientId — same precedent as TASK-004 selection, so unsplit/tab-close leaves no ghost.
2. Selection per pane: selectionState gains byClient: Map<clientId, CanvasSelection>. current keeps last-writer-wins semantics so 'selection' is unchanged; byClient is what panes reads.
3. src/core/panes.ts builds the report: order + place ('left'/'right'/'top'/'bottom'/grid) derived from the reported page rects, not from shell layout knowledge; arrangement ('none'|'single'|'side-by-side'|'stacked'|'grid'); per pane board/variant/level, elementCount, viewport, primary, focused, selection {count, capped ids, short names}. Plus summary + text.
4. describe.ts exports nameSelection() so the selected-thing names come from the one place that already folds bound text and multi-element nodes. NEVER inline board contents — view state only.
5. GET /api/panes; CLI 'panes [--text]'; MCP get_panes. Consistent with selection's registration.
6. Frontend: useCanvasSession publishes pane state on connect/board adopt/focus/geometry change, debounced, only when it materially changed; Shell passes focused raw. No new socket.
7. Verify in Chrome: split two panes, different selections + different scroll, confirm the report distinguishes them; close a pane -> gone; no browser -> reads sensibly; selection still works. bun run test + type-check. Clear canvas, close tab.
8. File the follow-up task for independently addressable panes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. DECISION: reporting only — TASK-021 files the independent-addressing follow-up.

Surfaces: GET /api/panes, CLI `panes [--text]`, MCP `get_panes`. All three share one report builder (src/core/panes.ts) so the text and JSON can never disagree.

How the server learns what is on screen: each pane POSTs /api/panes with its own board key, its page rect, its scene viewport, focus, primary, elementCount. Pushed like selection, so reading it is a map lookup and never a browser round-trip. A registration lives exactly as long as the pane's socket — the ws close handler drops the pane and its selection together (TASK-004's precedent), and POST is refused for a clientId with no live socket, which is what stops React's teardown-order onChange from resurrecting an unsplit pane 300ms after it went. Verified: no ghost after unsplit or tab close.

Selection is now per pane: selectionState gained byClient (Map<clientId>), while .current keeps last-writer-wins so `selection` is unchanged. Two panes can hold different picks; `selection` reports the most recent, `panes` reports both.

Arrangement is derived from the reported rects, not from shell layout knowledge: side-by-side / stacked / grid / overlapping / single, with place as left, right, top, bottom, 'tab N of M'. 'overlapping' exists because two browser tabs are not a split and 'the left one' would be a lie there.

Cost: selection contributes bounded output (names capped at 4, ids at 20, one pass over the board to name them). No elements ever appear. Two panes with selections is ~1.5KB JSON, four text lines.

Frontend: useCanvasSession gained the pane channel (300ms debounce, dedup on a rounded serialisation, suppressed after teardown, re-announced on reconnect). Pane geometry is measured off the DOM via a ResizeObserver on .pane-canvas, not read from Excalidraw appState — appState catches up with a split on its own schedule, and a stale width put the panes in the wrong place (caught in the browser, fixed).

Docs: DESIGN.md, CLAUDE.md, archboard-dev and excalidraw-skill updated; skills re-synced.

Orchestrator verification in Chrome on the fixture vault: single pane reads 'the only pane'; after split, 'left'/'right' with the selection located in the left pane only, plus an honest line stating every pane shows the same board because the server holds one at a time; unsplit left no ghost, re-checked 3s later since the ghost previously appeared ~300ms after teardown; closing the tab dropped the pane. No-browser reads 'No pane is open, so nothing is on screen' with a note that the board is unaffected. Payload is 247 bytes with no pane open — cheap enough to call every turn, which was the design constraint. bun run test and type-check green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
panes reports view state and never board contents: per pane, its reading-order place (left/right/stacked/tab N of M), the board it adopted, element count, viewport in scene coordinates, focus, which pane answers screenshots, and its selection folded through describe's existing logic so it never disagrees with selection. Arrangement is derived from reported rects, including an overlapping case for two tabs where 'the left one' would be a lie. Scoped to reporting; independent pane addressing is TASK-021, because that is a change to authority rather than reporting and would leave every board-blind caller ambiguous.
<!-- SECTION:FINAL_SUMMARY:END -->

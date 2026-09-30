---
id: TASK-016
title: Build the archboard shell around Excalidraw
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 16:59'
updated_date: '2026-08-19 17:34'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 16000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A shell UI hosts the Excalidraw canvas rather than the canvas being the whole app
- [x] #2 The Sync to Backend button is gone; sync is automatic and the server is authoritative
- [x] #3 Clearing a board requires confirmation through a modal, safe against a stray touch
- [x] #4 The open board, variant and level are visible, and the page title reflects them
- [x] #5 Shell UI to open a board or variant, and to create a new one
- [x] #6 The shell can host more than one pane without duplicating canvas logic
- [x] #7 Upstream POC chrome we do not need is removed; extras we do need live in the shell
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Frontend restructure: shell owns chrome; canvas is a hosted component.
   frontend/src/shell/{Shell.tsx,BoardBar.tsx,BoardDialog.tsx,ConfirmDialog.tsx,shell.css}
   frontend/src/canvas/{CanvasPane.tsx,useCanvasSession.ts,elements.ts,changes.ts,api.ts}
   All per-canvas logic (WebSocket, incoming-message application, change
   reporting, selection publishing, export/viewport/mermaid handling) lives in
   useCanvasSession. A pane is <CanvasPane paneId=... />; Shell renders
   panes.map(...). Mounting a second pane duplicates no logic. That is the seam
   TASK-006 lands on.
2. Server authority: delete POST /api/elements/sync (clear + replace-all).
   Add POST /api/elements/changes taking {upserts, deletes, clientId}: the
   server merges upserts into its map and removes only the ids the client
   explicitly named. It never clears. The client computes the delta against a
   baseline of ids it has actually seen, so an element the tab never received
   can never appear in deletes -> a stale tab cannot truncate a board.
   Server broadcasts elements_changed with the originating clientId; the
   originating pane skips its own echo.
3. Confirmation modal for clear: one DELETE /api/elements/clear?board= behind a
   real modal (large targets, Escape/backdrop cancel, focus on Cancel, names
   the board and count). No native confirm().
4. Board/variant UI in the shell bar: board, variant, level, element count,
   connection, save state; Open... / New... / Save dialogs over the existing
   /api/boards{,/current,/open,/new,/save}. document.title reflects identity.
   Save keeps saying last-writer-wins.
5. Cleanup: remove the Sync button + spinner + sync-status readout + zh-CN
   time formatter, the POC page title and the inline POC stylesheet, and the
   dead elements_synced / on-connect sync_status WS chatter.
6. Verify in Chrome against a real vault; bun run test; leave canvas cleared.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Implemented

**Shell.** `frontend/src/App.tsx` (1163 lines, everything in one component) is
deleted and replaced by:

- `frontend/src/shell/` — Shell.tsx (chrome, board state, pane list, dialogs),
  BoardBar.tsx, BoardDialog.tsx (open / new / save-as), ConfirmDialog.tsx,
  Modal.tsx, shell.css.
- `frontend/src/canvas/` — CanvasPane.tsx (~60 lines: a mount point),
  useCanvasSession.ts (the whole conversation with the server), elements.ts
  (the conversion helpers, unchanged), changes.ts (baseline + diff), api.ts.
- `frontend/src/types.ts` — shared shapes.

The pane seam is `useCanvasSession(paneId)`. Shell holds `panes: string[]` and
renders `panes.map(...)`; a second pane is one push. Verified with a real second
pane: it draws, reports, publishes selection under its own client id, and the
first pane picks the change up over the socket. Request/response traffic
(export, viewport, mermaid) is answered only by the primary pane so it is
answered once.

**Server authority.** `POST /api/elements/sync` is deleted (now 404). It cleared
the board's element map and refilled it from one tab. Replaced by
`POST /api/elements/changes` taking `{upserts, deletes, clientId}`: upserts are
merged into whatever the server holds (server keeps createdAt / version /
source), deletes remove only ids present. The server never clears. The browser
computes the delta against a baseline of elements it has actually received, so
an element a tab never saw cannot appear in `deletes`. Broadcast is a new
`elements_changed` carrying `origin`, which the reporting pane skips.
Reports are HTTP, deliberately not gated on the socket, retry every 2s on
failure, and flush through sendBeacon on pagehide. Debounce cut 1200ms -> 400ms
since the payload is now a delta.

**Clear.** One `DELETE /api/elements/clear?board=` behind a modal that names the
board and the element count, with 48px targets, Escape/backdrop cancel and focus
on Cancel. No native confirm().

**Board UI.** Bar shows board, variant, level, element count, connection and
save state; document.title tracks identity. Open lists the vault and accepts a
typed address; New takes name/variant/level; Save uses the existing routes and
surfaces the last-writer-wins warning verbatim.

**Removed.** Sync to Backend button, spinner, sync-status readout and the zh-CN
time formatter; the `elements_synced` message and the on-connect `sync_status`
message (nothing consumed them); the POC page title and the inline POC
stylesheet in index.html.

**Also.** Frontend type imports were resolving to `any`
(`@excalidraw/excalidraw/types/types` is not a real specifier). Fixed, and added
tsconfig.frontend.json so `bun run type-check` covers the browser half.

## Verified in Chrome (vault-backed server)

- board identity, variant chip, level, count, save state, page title
- open payments@option-a from the list: canvas swapped to 0 elements, no stale
  elements from payments
- New -> payments@option-b created and switched to
- drew a rectangle: reached the server with no manual sync, tagged frontend_sync
- promote via CLI, then dragged the shape in the browser: position changed,
  customData and link both intact
- `./bin/canvas selection --text` reported the browser selection, per pane
- clear modal cancelled (Escape, board intact) and confirmed (0 elements)
- Save wrote the note and showed the last-writer-wins warning
- Split mounted a second pane; both round-trip; Unsplit returns to one
- POST /api/elements/sync -> 404; a client reporting one element into a
  three-element board left all four elements standing (3 -> 4, not 1)
- `bun run test`: 5 MCP stdio checks + local bind check pass

Orchestrator verification in Chrome. Safety property checked first and structurally: POST /api/elements/sync returns 404, and a client posting one element to /api/elements/changes against a 3-element board left 4 standing, not 1 — the server merges and never clears, so the stale-tab-truncates-the-board hazard is closed by construction rather than by a check. Shell: page title 'scratch · archboard', header carries board name, variant badge, element count and save state, no Sync button. Clear modal names the count and the board and adds 'This board has never been written to the vault, so there is nothing to recover it from' only because the board is unsaved; Escape cancelled and the board survived. Drew a rectangle with no manual sync and the server went 4 -> 5, tagged frontend_sync. Split mounted a second pane, each with its own live indicator, button flipped to Unsplit. bun run test green; type-check now covers the frontend too.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 16:59
---
Design note from the user's direction: 'server is the authority' is not just about deleting a button. Today POST /api/elements/sync lets the frontend CLEAR the server's element map and replace it wholesale — that is frontend-as-authority on every sync, and it is the mechanism behind the stale-tab-truncates-the-board failure mode. Removing the button without addressing the endpoint leaves the hazard reachable by any client. The frontend should report changes and the server should apply them.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
App.tsx (1163 lines) is replaced by a shell/ + canvas/ split where useCanvasSession(paneId) is the seam — Shell renders panes.map() and a second pane is one push with no duplicated WebSocket, sync or selection logic. The replace-all sync endpoint is deleted and replaced by /api/elements/changes carrying upserts and deletes computed against a baseline of elements the tab has actually received, so an element a tab never saw cannot be deleted; that is a structural property, not a guard. Clear now goes through a context-aware confirmation modal. Board identity, variant, level, save state and open/new/save UI live in the shell. Verified in the browser.
<!-- SECTION:FINAL_SUMMARY:END -->

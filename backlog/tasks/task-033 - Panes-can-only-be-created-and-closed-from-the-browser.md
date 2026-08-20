---
id: TASK-033
title: Panes can only be created and closed from the browser
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 02:38'
updated_date: '2026-08-20 03:47'
labels: []
dependencies: []
references:
  - frontend/src/shell/BoardBar.tsx
  - frontend/src/shell/Shell.tsx
  - src/server.ts
  - src/core/panes.ts
  - src/cli/commands/board.ts
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pane layout lives entirely in the frontend. The Split and Unsplit buttons in BoardBar.tsx call onAddPane/onClosePane in the shell; the server only learns a pane exists when its socket registers. So the CLI can point an existing pane at a board but cannot make one.

Concretely: `archboard board open <name> --pane right` fails with 'No pane called "right"' whenever only one pane is open, and there is no command that would create it. An agent asked to put two variants side by side has to stop and ask the human to click Split, which breaks the voice loop precisely where side-by-side comparison is the point (TESTING.md step 6 already tells the human to press Split).

Viewport control has the same shape of gap in src/server.ts: the /viewport handler resolves its target with primaryPane() and sends to that one pane. An agent cannot frame what is in the second pane, so after a split it can read the other pane with `panes` but cannot scroll or zoom it.

Panes exist only while a browser tab is open, so these commands need a browser and should fail with exit 4 like screenshot does, not invent panes headlessly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A CLI command opens a second pane with no browser interaction
- [x] #2 A CLI command closes a pane, naming it the same way --pane already does (place, position, id)
- [x] #3 board open --pane <place> either creates the pane when it is missing or says exactly how to create it; the current bare refusal is not enough
- [x] #4 Viewport control can address a named pane instead of only the primary one
- [x] #5 Every new command fails with exit 4 and a clear message when no browser tab is open
- [x] #6 MCP gains the equivalent tools so scripts/check-surface-parity.mjs still passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Surface. Two new CLI subcommands under a `pane` command — `pane open [--board <key>]` and `pane close <spec>` — plus a new `viewport` command that takes `--pane`. `panes` (the report) is unchanged. CONTEXT.md's Pane entry forbids "split", so the commands are open/close, not split/unsplit. `pane open --board X` is the one command for "put the proposal beside the current one": it cannot target an existing pane at all, so it cannot clobber one.
2. Server, additive only (TASK-034 also edits src/server.ts, so keep the diff local). `POST /api/panes/open {board?}` and `POST /api/panes/close {pane}` send `pane_open` / `pane_close` to one socket and resolve when the pane registry actually changes — a registration appearing or a socket closing is the ground truth that a pane exists, not a promise from the shell. Both 503 with `code: BROWSER_REQUIRED` when nothing is on screen; so does /api/viewport, so the new CLI maps them to exit 4.
3. Pane cap. The shell lays out at most two panes (.panes-2 in shell.css, Split hidden past two), so MAX_PANES lives in src/core/panes.ts and the server refuses a third before touching the browser.
4. Board into the new pane is two calls from canvas-client, not a second copy of the open-a-board logic: create the pane, then POST /api/boards/open with pane=<clientId>. Vault loading, memory-vs-vault source and the frontmatter mismatch note all stay in the one route that already does them.
5. Viewport addressing. /api/viewport takes an optional `pane` spec, resolved with resolvePaneSpec and sent to that pane stamped with that pane's board; the frontend stops gating set_viewport on primary, since the message only reaches the pane it was addressed to.
6. Frontend. Shell owns layout, so pane_open/pane_close arrive on a pane's socket and are handed up: useCanvasSession -> CanvasPane -> Shell. onClosePane closes the named pane instead of always keeping the first.
7. Refusals. resolvePaneSpec's unknown-pane message gains the command that makes one, and the panes report tells a lone pane how to get a second — that is where an agent reads the screen every turn.
8. MCP. `open_pane`, `close_pane`, `pane` on `set_viewport`; pair pane open/close in check-surface-parity.mjs and pair the new `viewport` command with set_viewport, retiring the MCP_ONLY 'CLI lags' entry. Two rows in the skill cheatsheet's MCP table, which the parity check requires.
9. Tests. Extend scripts/check-boards.mjs: its sockets already stand in for panes, so add a shell stand-in that answers pane_open by opening another socket and pane_close by closing one. Cover creating, the cap, closing the last pane, exit-4 with no browser, and viewport reaching the second pane.
10. Docs: CLAUDE.md pane paragraph, TESTING.md step 6 (which today tells the human to press Split).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Surface: `pane open [--board <key>]` and `pane close <spec>` (a `pane` command beside the existing `panes` report), plus a `viewport` command that closes the MCP-only camera gap. CONTEXT.md forbids 'split' as a word for a pane, so the pair is open/close. MCP gains `open_pane` and `close_pane`; `set_viewport`, `get_canvas_screenshot` and `export_to_image` gain an optional `pane`.

Rejected: making `board open --pane right` create the missing pane. Opening a board would then have a layout side effect, and there would be two commands that sometimes make a pane. Instead the refusal names the command, and `pane open` is the one that makes one — it cannot be aimed at an existing pane, so it is the move that cannot overwrite what the human is reading.

Rejected: a reply from the shell as the acknowledgement. A pane exists exactly as long as its socket registration, everywhere else in server.ts, so both routes wait for the registry to change instead: a new registration for open, a socket close for close.

The board is opened into the new pane by a second call from canvas-client rather than a second copy of the open-a-board logic in the layout route, so vault loading, unsaved-work-kept and the frontmatter mismatch note all stay in the one route that already does them.

Found in a real browser, not in review: answering the split as soon as the new pane registers reports stale geometry, and a plain left/right split came back as 'row 2, column 2'. Fixed by waiting until every pane has re-reported (cap 1.5s, typically ~0.4s end to end).

Folded in on the coordinator's request: image export was primary-pane-only for the same reason viewport was, so `screenshot --pane` / `pane` on both image tools, and the frontend no longer gates export or viewport on being the primary pane.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Panes can now be made and unmade from outside the browser, so a thread that can only talk can put a proposal beside the current architecture instead of overwriting it.

`archboard pane open [--board <key>]` splits the canvas and opens that board into the pane it made; `archboard pane close <left|right|1|primary|focused|id>` takes one away. Both go through new /api/panes/open and /api/panes/close routes that ask the shell over a pane's socket and then wait for the pane registry to agree, because a registration is the only evidence a pane exists. Two panes is the cap the shell lays out, so a third is refused before the browser is asked. Camera control and image export stopped being primary-pane-only: /api/viewport and /api/export/image take a `pane`, there is a new `viewport` command (retiring the 'CLI lags' asymmetry), and `screenshot --pane` pictures the half you drew in. MCP gained open_pane and close_pane and a `pane` argument on set_viewport, get_canvas_screenshot and export_to_image.

Verified in a real browser on a throwaway canvas: `pane open --board proposal` produced a second pane on screen holding the proposal with the first pane untouched, `screenshot --pane right` returned the proposal and --pane left the current board, `viewport --fit --pane right` moved only the right camera, and `pane close left` closed the named pane rather than the last one, leaving the proposal showing. Also verified headlessly in scripts/check-boards.mjs, which now simulates the shell answering pane_open and pane_close: 31 new checks covering creation, the two-pane cap, the refusal to close the last pane, the refusal that now names the command that makes a pane, per-pane viewport and export delivery, and exit 4 from the CLI for `pane open`, `pane close`, `viewport` and `screenshot` with no browser. `bun run test` passes, including surface parity.
<!-- SECTION:FINAL_SUMMARY:END -->

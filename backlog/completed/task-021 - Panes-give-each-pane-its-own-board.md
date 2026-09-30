---
id: TASK-021
title: 'Panes: give each pane its own board'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 19:17'
updated_date: '2026-08-20 01:12'
labels: []
dependencies:
  - TASK-006
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Side-by-side current-vs-proposed is the reason panes exist (CONTEXT.md), but the server holds one active board, so today both panes necessarily show it. TASK-006 built the reporting half — `panes` already reports the board each pane adopted, per pane, so no reporting shape has to change — and deliberately left addressing out, because addressing is a change to authority rather than to reporting.

The hard part is not the second board; it is that `activeBoard()` is what every board-blind caller means today (add, describe, clear, promote, board save, most of the REST surface, every CLI and MCP tool). Once two panes hold different boards, "the board" is ambiguous for all of them, and the task has to decide what an unqualified write targets: the focused pane, the primary pane, or a still-single active board that one pane may deviate from. Board switching is also broadcast to every client at present (`board_switched` goes to all sockets), so a pane has to be able to be addressed individually.

The follow-up is worth it: without it, `panes` can distinguish left from right by viewport and selection but never by subject, and the comparison workflow the shell was built for cannot be done on screen.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A pane can be pointed at a board without changing what the other pane shows
- [x] #2 It is unambiguous which board an unqualified write (add, clear, promote, save) targets, and that rule is documented
- [x] #3 A board switch reaches only the pane it was addressed to
- [ ] #4 panes reports the two different boards without any change to its output shape
- [ ] #5 The shell offers the human a way to open a board into a specific pane
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
DECISION (authority), set by the user: EVERY board-touching call names its board. There is no active board, no fallback, and no compatibility shim — a shim is the ambient default in a costume (same class of bug as TASK-031's cwd-relative bindings).

  resolveBoard(key) with no key -> BoardRequiredError. Not a type error: a sentence saying what to pass and what is open right now.

Consequences, deliberately taken rather than worked around:
- activeBoardKey()/activeBoard()/setActiveBoard() are DELETED from the store. There is nothing left to fall back to, so nothing can silently fall back.
- `board list` loses `active`; /health and /api/sync/status stop naming a board; the change feed, snapshots, save, clear, describe, query, export, import, share, mermaid and every /api/elements route require ?board=.
- SCRATCH SURVIVES as a board like any other, and must still be named (`--board scratch`). It is what a pane adopts when nothing else is on screen, so a first-time user sees a board, and every refusal lists the open boards — scratch among them — so the next step is on screen at the moment of the mistake. A DISPLAY default is not an authority default: the pane says which board it holds, and everything that writes says so out loud.

Two axes, two rules:
- BOARD (authority): always explicit. Never inferred from focus, from the last open, from the environment.
- PANE (display): `board open X` with one pane on screen lands in it; with two, --pane is required, because putting a board on the wrong half is still a guess. The response always names the pane it landed in.
Operations that are about the browser rather than about a board — screenshot, viewport, the panes report — stay pane-addressed and take no board. Mermaid converts in the primary pane, so it names a board and refuses when that is not the board the pane holds.

1. src/core/board-target.ts: BoardRequiredError (400, lists open boards and how to see the vault). Ambiguity between panes stops existing as a concept — nothing resolves implicitly, so nothing can be ambiguous.
2. src/core/board-store.ts: resolveBoard requires a key; activeKey and its three accessors deleted; boardSummaries() loses `active`; SCRATCH key exported for the new-pane display default.
3. src/core/panes.ts: shared reading-order/place used by both the report and pane addressing (resolvePaneSpec: left/right/top/bottom/1-based/focused/primary/paneId/clientId). Drop the 'server holds one board at a time' line.
4. server.ts: paneBoards Map<clientId, key> is what a pane holds. switchCanvasTo -> switchPaneTo: board_switched to that pane's socket only, only that pane's selection dropped, feed reset only when the board was not already on screen. New socket resumes its remembered board, else the primary pane's, else scratch. Clear drops only selections of panes on that board. Selection is named out of the selecting pane's board. Files and selection broadcasts become boardless. Export/viewport/mermaid addressed to the primary pane and its board.
5. /api/boards/current -> /api/boards/info?board=; CLI `board current` -> `board info [name]`. The browser stops asking what the server's current board is: a pane re-fetches its own key, the shell asks about the focused pane's board.
6. CLI: global --board <key> stripped in run.ts and applied by canvas-client to every request (requestJson + syncToCanvas + getElementFromCanvas). `board open|new [--pane <spec>]`. promote/demote refuse when the live selection is on a different board than the one named. New exit code path for BOARD_REQUIRED (usage, 2).
7. MCP: `board` becomes a REQUIRED property on every board-scoped tool, injected in one place over the tool table; open_board/new_board gain pane.
8. scripts/check-board-target.mjs wired into bun run test; fix any check script that relied on an implicit board.
9. Docs: ADR 0009 (explicit boards, and the display/authority split); CLAUDE.md, DESIGN.md, TESTING.md, README/INSTALL where they say the canvas holds one board; both skills; re-sync.
10. Verify in Chrome on the fixture vault: split, payments left and payments@option-a right, edit each, panes reports both without the stale caveat, selection per pane, board_switched reaching one pane only; then an unqualified add refused with a usable message, and the same add with --board landing on the named board.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. DECISION (authority, set by the user mid-task): every board-touching call names its board; there is no active board and no fallback. activeBoardKey()/activeBoard()/setActiveBoard() are deleted from the store, resolveBoard() requires a key, and a call without one gets a BoardRequiredError (400, code BOARD_REQUIRED, exit 2) that says nothing was done, how to name a board, and which boards are open. ADR 0009 records it and why the three easier answers were rejected.

Two axes, deliberately asymmetric. BOARD is authority and is always explicit. PANE is display and keeps one default where it cannot be wrong: one pane on screen and `board open` goes there, two and --pane is required, none and the board loads without being shown; the answer always names the pane it landed in. Operations addressed to the browser rather than a board — screenshot, viewport, panes — take no board. mermaid converts in the primary pane, so it names a board AND is refused when that is not the board the pane holds.

SCRATCH survives as a board like any other, named like any other. It is what a lone pane adopts, and every refusal lists it, so a first run has something in front of it and an obvious next step. A second pane starts on what the first is showing. Nothing remembers a last-opened board: that would be the deleted pointer, reintroduced as a display default.

Server: paneBoards Map<clientId,key> is what each pane holds; switchCanvasTo became switchPaneTo, sending board_switched to that pane's socket alone (sendToPane), retiring only that pane's selection, and resetting the change feed only when the board was not already on screen elsewhere. clear drops only the selections of panes on that board. selection is named out of the selecting pane's board. files and selection broadcasts became boardless. Export re-sent the active board's scene to EVERY socket before capturing — that would have yanked both panes onto one board, so it is now sent to the primary pane alone, carrying that pane's board; viewport likewise.

Surfaces: global --board on the CLI (stripped in run.ts, applied by canvas-client at its single request choke point); `board open|new --pane left|right|top|bottom|N|primary|<paneId>`; `board current` -> `board info`; /api/boards/current -> /api/boards/info?board=; /api/boards drops `active` for `onScreen`; compare's per-side `active` became `onScreen`; /health and /api/sync/status count boards instead of naming one. MCP: `board` injected as a REQUIRED property over the tool table for 25 board-scoped tools (optional on get_resource), set once at dispatch. The browser was already explicit; the two places it was not — a pane asking the server which board is current, and the shell's save/board-info — now name the pane's own board. BoardDialog gained a pane picker, shown only when more than one pane is open.

Tests: scripts/check-boards.mjs, 52 checks, wired in as test:boards. It runs the real canvas server with two real WebSockets standing in for panes, so per-pane addressing, targeted board_switched, per-pane selection, per-board baselines and every refusal are covered headlessly. Suite: 5 stdio, 108 obsidian, changes+injection, 80 labels, 47 library, 52 boards, parity — all green; type-check clean.

Browser verification on the fixture vault: split, payments in the left pane and payments@option-a in the right, both live at once. Opening into one pane left the other's board, scene and selection untouched. Selections held in both panes simultaneously and each was named out of its own board ("Payments" from payments, "Ledger" from payments@option-a). A drag in the right pane moved o-led on option-a only; payments unchanged. `panes` reported both boards and dropped the stale caveat, replacing it with what an unnamed call will do. Unqualified `add` was refused listing payments, payments@option-a, scratch; the same add with --board payments@option-a landed there and nowhere else. `board open payments@twin` with two panes was refused naming both; with --pane right it switched only the right pane and the left kept its selection. mermaid at a board the primary pane was not holding was refused with the command to fix it. screenshot still answers from the primary pane.

Orchestrator verification in Chrome on the fixture vault. Two panes held payments (20 elements) and payments@option-a (30) at once. Adding to option-a took it to 31 and left payments at 20. An unqualified 'board open' with two panes refused, naming what each pane was showing; '--pane right' switched only that pane and its confirmation reminded the caller that commands still name the board. Unqualified 'add' refused with exit 2 and a message naming the three surfaces, the open boards, and the two discovery commands. The panes line now reads 'The panes disagree, so commands that name no board are refused until one is named', replacing the old one-board caveat.

One false alarm of mine, recorded so it is not rediscovered: reading 'panes' immediately after 'board open' showed the pane's previous element count. That is my read racing the repaint, not a bug; a second later it was correct. Full suite green including 52 new board checks.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Each pane holds its own board. The active board is deleted rather than defaulted, so every board-touching call names its board and an unnamed one is refused with a message naming the surfaces, the open boards and how to list more. Board and pane are deliberately asymmetric: board is authority and always explicit, pane is display and keeps a default only where it cannot be wrong, which is when exactly one pane is open. Found and fixed a trap on the way: image export re-broadcast the active board's whole scene to every socket, which under per-pane boards would have yanked both panes onto one board.
<!-- SECTION:FINAL_SUMMARY:END -->

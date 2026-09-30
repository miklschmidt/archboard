---
id: TASK-046
title: mermaid can only draw into the primary pane
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 03:55'
updated_date: '2026-08-20 04:24'
labels: []
dependencies: []
references:
  - src/server.ts
  - src/core/panes.ts
  - src/cli/commands/scene.ts
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Left named but unfixed by TASK-033, which gave viewport, screenshot and image export a --pane argument and did not reach mermaid.

mermaid still resolves its target with primaryPane(), so you cannot convert a diagram into the right pane. The refusal tells you to move the board into the primary pane first, which means taking the current architecture off screen to draw a proposal, in a tool whose point is having both up at once.

The TASK-033 agent named the honest fix rather than doing the quick one: resolve the pane from the board mermaid already requires, rather than adding another --pane argument. Every mermaid call names a board, and a board is in at most one pane, so the pane is already determined and asking for it again would be a second way to say the same thing. That changes documented behaviour, which is why it was left.

Worth checking whether any other route still resolves through primaryPane() once this lands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 mermaid draws into the pane holding the board it was given
- [x] #2 No route resolves a target through primaryPane() where the board already determines the pane
- [x] #3 The skill and TESTING.md no longer tell anyone to move a board into the primary pane first
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. server.ts: add paneBoardKey() and paneShowing(board) beside primaryPane(). paneShowing returns the pane holding a board, preferring the primary one if several hold it, null if none does.
2. server.ts: rewrite POST /api/elements/from-mermaid to resolve its pane from the board it already requires. No pane open at all keeps the 503 browser-required answer. A board on no pane is a 409 that lists the panes on screen and names the command that puts the board on one: `pane open --board <key>` while there is room, `board open <key> --pane <spec>` when the screen is full. The success answer names the pane it converted in, the way board open does.
3. server.ts: primaryPane()'s doc comment stops claiming mermaid as a caller.
4. frontend/src/canvas/useCanvasSession.ts: stop gating mermaid_convert on primary. The server addresses it to one socket, so the pane that receives it is the pane that was asked. This is what TASK-033 did to export and viewport and did not do to mermaid.
5. src/core/mcp-tools.ts: create_from_mermaid's description says it converts in the pane holding the board it names. No new argument: board is already required, and the pane is not a second thing to choose.
6. src/cli/commands/scene.ts: mermaid prints the pane it converted in.
7. scripts/check-boards.mjs: checks that mermaid reaches the pane holding the named board and no other, that it works for either pane, that a board on no pane is refused with the panes listed and a command to fix it, and that a refusal converts nothing.
8. TESTING.md: the side-by-side step gains a mermaid line, since the point of the fix is drawing into the right pane while the left keeps the current architecture.
9. Sweep every remaining primaryPane() call and report which are right. skills/excalidraw-skill is owned by another agent, so its wording goes in a comment on this task rather than in a diff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
mermaid resolves its pane from the board it already requires, and takes no --pane.

src/server.ts: primaryPane() keeps its job for the two routes that name no board (image export, viewport), and its comment now says why an operation that names a board must not come through it. New beside it: paneBoardKey(pane), paneShowing(board) and panesShowingList(). paneShowing returns the pane holding a board, preferring the primary one when two panes hold the same board, because either would convert into the same board and a stable answer beats a refusal there. primaryPaneBoard() is gone, it had no other caller.

POST /api/elements/from-mermaid now sends to paneShowing(wanted). Three answers instead of two: no pane at all is 503 BROWSER_REQUIRED as before, a board no pane is holding is 409 that lists every pane and what it holds and names the command that puts the board on screen, and success carries board, pane and a message naming the pane, the way board open does.

The refusal picks its command by whether there is room on the glass. One pane and it offers 'archboard pane open --board <key>', which makes a pane rather than repointing the one the human is reading. Two and it offers 'board open <key> --pane <left|right>', because there is nothing else left to offer.

frontend/src/canvas/useCanvasSession.ts: mermaid_convert is no longer gated on primary. The server addresses it to one socket, so the pane that receives it is the pane that was asked. TASK-033 removed this gate from export and viewport and did not reach mermaid, so the server could pick the right pane and the right pane would still drop the message. The primary flag now guards only library_changed, which really is one piece of news every pane hears.

Surface: create_from_mermaid already required board, so no MCP argument changed and parity is unaffected. Its description, the CLI usage line and canvas-client's sendMermaid all say the board picks the pane and that there is no pane to pass.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-20 04:23
---
AC3, the half I do not own. skills/excalidraw-skill/ belongs to another agent on this sweep, so here is the exact text that is now wrong.

1. SKILL.md, the pane bullet list around line 82:

    - `screenshot`, `mermaid` and viewport control are answered by the **primary
      pane**, the first one on the left, whatever board it is holding.

   Two things wrong with it. mermaid is no longer answered by the primary pane, it is answered by the pane holding the board it names. And screenshot and viewport have taken --pane since TASK-033, so they are not primary-only either. Suggested replacement:

    - `screenshot` and viewport control take `--pane` and no board: a picture is of a
      half of the screen. Without `--pane` they answer from the primary pane, the first
      one on the left.
    - `mermaid` is the other way round. It names a board and takes no `--pane`:
      conversion runs in the pane holding that board, and there is at most one.

2. SKILL.md, the paragraph directly under it, around line 85:

    That last point has a sharp edge: **you cannot screenshot the right pane.** To
    check a proposal that is on the right, read it with `describe --board <key>`,
    or open it on the left for a moment. `mermaid` is stricter still and refuses
    outright unless the board you name is the board the primary pane holds.

   Every sentence in it is now false. `screenshot --pane right` works (TASK-033) and mermaid no longer cares which pane is primary. Suggested replacement:

    Neither of these needs a board moved to reach it. `screenshot --pane right`
    pictures the proposal where it is, and `mermaid --board payments@option-a` draws
    into whichever pane is holding that board. mermaid is refused, converting nothing,
    only when no pane is holding the board at all, and the refusal names the panes on
    screen and the command that puts the board on one.

3. SKILL.md, Workflow: Mermaid Conversion, around line 442:

    Requires an open browser tab (conversion runs in the frontend; exit code 4 tells you to open the canvas URL). Conversion happens in the pane that answers for the browser, so the board you name has to be the board that pane is holding — if it is not, the call is refused rather than converting into the wrong board.

   Suggested replacement for the second sentence:

    Conversion happens in the pane holding the board you name, so the diagram appears
    beside the current architecture rather than on top of it, and there is no --pane to
    pass. If no pane is holding that board the call is refused and nothing is converted.

4. references/cheatsheet.md line 185, the create_from_mermaid row:

    | `create_from_mermaid` | Mermaid diagram to Excalidraw. Converts in the pane that answers for the browser, so `board` has to be the board that pane holds — refused otherwise | `board`, `mermaidDiagram` |

   Suggested replacement for the description cell:

    Mermaid diagram to Excalidraw. Converts in the pane holding `board`, so there is no pane argument; refused, converting nothing, when no pane is holding it

TESTING.md was mine and is done: it never said to move a board into the primary pane, and section 5 gained a step 7 that converts into the right-hand pane while the left keeps the current architecture.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
mermaid resolves its pane from the board it already names, so a proposal can be drawn into the right-hand pane without taking the current architecture off the left. No --pane was added: a board is in at most one pane, so a second way to say it would also be a way to say two different things. The frontend gate that made only the primary pane answer a conversion is gone, which is what TASK-033 did to export and viewport and did not reach.

AC1, verified in a real browser against a throwaway canvas on port 34567 with a scratch vault: payments in the left pane (primary), payments@option-a in the right (not primary), 'mermaid --board payments@option-a' answered 'the right pane', and three seconds later payments@option-a held 8 elements reading Client, API, Ledger DB while payments still held its 2. A screenshot shows both boards up at once. Reverting paneShowing in dist/server.js to the old primary-pane resolution fails 4 checks in scripts/check-boards.mjs; restoring it passes all of them.

AC2, the sweep: three primaryPane() call sites remain and all three are right. /api/panes/open picks a pane to ask the browser for a split and names no board. /api/export/image and /api/viewport fall back to it when no --pane is given, and neither route takes a board, because a picture and a camera move are about a half of the screen (ADR 0009). The only other pane-and-board site is switchPaneTo, where the pane comes from --pane or soloPane and cannot come from the board, since board open is the command that decides which pane a board goes into.

AC3: TESTING.md never told anyone to move a board into the primary pane, and now has a step that converts into the right-hand pane. The skill does say it, in four places, and belongs to another agent on this sweep, so the exact text and replacements are in a comment on this task.

New checks in scripts/check-boards.mjs: conversion reaches the pane holding the named board and no other, in both directions so it cannot pass by always picking one; the answer names that pane; a board on no pane is refused with nothing sent to either pane, the panes listed, and the right command for whether there is room on screen; and a headless canvas answers BROWSER_REQUIRED. bun run test exits 0 with 0 failures.
<!-- SECTION:FINAL_SUMMARY:END -->

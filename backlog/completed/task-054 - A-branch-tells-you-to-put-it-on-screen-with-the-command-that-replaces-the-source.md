---
id: TASK-054
title: >-
  A branch tells you to put it on screen with the command that replaces the
  source
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 14:43'
updated_date: '2026-08-20 14:58'
labels: []
dependencies: []
references:
  - src/core/board.ts
  - src/cli/commands/board.ts
  - src/core/panes.ts
  - docs/adr/0012-a-save-writes-a-file-and-does-not-move-a-pane.md
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by running the clean test end to end.

Branching with one pane on screen answers:

  Branched "sandbox/payments" to "sandbox/payments@option-a". Nothing moved: the only
  pane still holds "sandbox/payments", and the branch is not showing anywhere. Put it on
  screen with `board open sandbox/payments@option-a`, which asks for a pane when more
  than one is open.

The first two sentences are the point of ADR 0012 and they are right. The third undoes it. With one pane on screen, `board open <branch>` puts the branch in that pane and takes the source off the screen, which is exactly the clobbering ADR 0012 stopped the save itself from doing. The message hands the caller a manual way to do the thing the change was made to prevent.

`pane open --board <branch>` is the right suggestion when there is room: it makes a pane and cannot target an existing one, so the source cannot be lost. `board open` is right only when the screen is already full, and then it should say which pane will be replaced.

The panes report already gets this right and has the wording to copy: "Only one board is on screen. To put another beside it, keeping this one: Open one with `archboard pane open [--board <key>]`". The refusal in resolvePaneSpec makes the same offer, gated on there being room (MAX_PANES).

This is the same class as TASK-045, where the skill taught a workaround for a limitation that no longer existed. Here the code teaches it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 With room for another pane, the branch answer offers pane open --board <branch>
- [x] #2 With the screen full it offers board open and says which pane would be replaced
- [x] #3 A check asserts the one-pane branch answer does not recommend a command that takes the source off screen
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Save response carries the screen: add panes.onScreen to POST /api/boards/save, one entry per pane in reading order, each naming its place and the board it holds. That is what the branch sentence needs and the CLI cannot see from where it stands.
2. CLI branch message picks its offer off that, the way the shell already does (frontend/src/shell/Shell.tsx saveNotice) and the way the mermaid refusal does (server.ts): room on the glass means `pane open --board <branch>`, which makes a pane and so cannot take the source off screen; a full screen means `board open <branch> --pane <place>`, naming each pane and the board it would replace.
3. No pane at all is its own case: nothing to sit beside, so say the canvas is not open rather than offer a command that will be refused.
4. Checks in scripts/check-boards.mjs, in the existing branch section: with two panes the CLI answer offers board open and names both panes and their boards; with one pane it offers pane open --board and never says board open.
5. bun run test, then commit src/server.ts, src/cli/commands/board.ts, src/core/canvas-client.ts (response type) and scripts/check-boards.mjs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The save now reports the whole screen, not just the panes it did or did not move: panes.onScreen carries every pane and the board it holds, reusing boardsOnScreen() (src/server.ts). The CLI picks its offer off that in howToShowBranch (src/cli/commands/board.ts), the way the shell already did in saveNotice and the way the mermaid refusal does: room on the glass means `pane open --board <branch>`, a full screen means `board open <branch> --pane <place>` with the board each pane would lose named, and no pane at all says to open the canvas first rather than offering a command that would be refused.

Verified against a real server with real sockets for panes (scripts/check-boards.mjs), five new checks in the branch section. Reverting the CLI half in dist/ fails 4; reverting the server half fails 3. All 13 suites pass (bun run test).

CLAUDE.md's branch paragraph said the branch 'is put up with board open like any other board', which is the same misdirection one level up, so it now names pane open first and says when board open is the right one.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A branch that moved nothing used to tell the caller to put it up with `board open <branch>`, which with one pane on screen lands in that pane and takes the source off, undoing exactly what ADR 0012 stopped the save from doing. The save response now carries panes.onScreen, and the CLI offers `pane open --board <branch>` while there is room, because it makes a pane and cannot be aimed at an existing one; only a full screen gets `board open`, and then it names the board each pane would lose. Verified by five checks in scripts/check-boards.mjs driving the real CLI against a real canvas with two sockets for panes and then one; reverting the fix in dist/ fails 4 of them.
<!-- SECTION:FINAL_SUMMARY:END -->

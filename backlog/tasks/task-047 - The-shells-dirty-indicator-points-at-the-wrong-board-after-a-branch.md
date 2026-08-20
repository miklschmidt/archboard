---
id: TASK-047
title: The shell's dirty indicator points at the wrong board after a branch
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 04:01'
updated_date: '2026-08-20 04:18'
labels: []
dependencies: []
references:
  - frontend/src/shell/Shell.tsx
  - src/core/board.ts
  - docs/adr/0012-a-save-writes-a-file-and-does-not-move-a-pane.md
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by the TASK-039 agent while changing what a save does to a pane, and left unfixed because it belongs to a file another agent held.

frontend/src/shell/Shell.tsx, attemptSave does setBoardInfo(saved) unconditionally. That assumed a save always leaves the pane holding whatever was written, which was true before TASK-039 and is not true now: a branch writes a second board and leaves every pane where it was (ADR 0012).

So after a branch the pane's boardInfo points at a board the pane is not showing, and the dirty indicator is computed against the wrong baseline. The header itself stays right because it prefers status.board, which is why this is subtle rather than obvious.

The fix the agent named: gate setBoardInfo on saved.panes.moved.some(p => p.clientId === status?.clientId), and extend the notice so it says the branch is not on screen. The save answer already carries panes { moved, kept } with each pane named, so the information needed is on the response.

Worth doing properly rather than by that one line: a save now has three kinds (saveKind is same-board, named or branch) and the shell should read the one the server sent rather than inferring.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 After a branch, the pane's dirty indicator is computed against the board that pane is actually showing
- [x] #2 The save notice says when the branch was written but is not on screen, and how to put it up
- [x] #3 The shell reads saveKind from the response rather than inferring what happened
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce on my own canvas: a vault-backed board in one pane, a conflict on disk, Save -> 'Save elsewhere' -> a branch. Record what the chrome says about the pane's save state before the fix.
2. Carry the save answer's shape into the frontend: saveKind, savedFrom and panes { moved, kept } on what saveBoard returns.
3. In attemptSave, decide from saveKind rather than from the bare fact of a save. A same-board write and a naming of scratch leave the pane holding what was written, so the pane's boardInfo becomes it; a branch leaves the pane where it was, so re-read the board the pane is actually showing instead.
4. Rewrite the save notice per kind. A branch says the branch is not on screen, names the panes still holding the source, and gives the command that puts it up: 'pane open --board <branch>' while a pane can still be added, 'board open <branch> --pane <spec>' when both are full.
5. Rebuild and re-run the same browser flow. Show the chrome now saying the source is still unsaved, and the notice saying where the branch went.
6. bun run test and bun run type-check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Read saveKind rather than gating on panes.moved alone. The one-line gate in the description would have broken the ordinary save: the server sends moved: [] for a same-board write (panesFollowSave is false for it), so setBoardInfo would never have run, savedAt would have stayed at the previous write and the indicator would have stayed lit after every plain Save. The three kinds are handled separately: same-board adopts the answer when the board written is the one this pane holds, named adopts it when the pane is in panes.moved, branch never adopts it and re-reads the board the pane is actually showing.

Response shape: frontend/src/types.ts gained PaneRef and BoardSaveResult (saveKind, savedFrom, panes { moved, kept }), mirroring src/core/canvas-client.ts, and frontend/src/canvas/api.ts saveBoard returns it. The server needed no change; everything the shell reads was already on the wire.

The branch notice holds until it is clicked away instead of timing out after 9 s, because it names a command to type. It picks the command that fits the layout: 'pane open --board <branch>' while a pane can still be added, 'board open <branch> --pane left|right' when both are full, and it says that the second one replaces what that pane is holding.

Verified against a throwaway canvas on port 4711 with its own vault, driven through the shell's own buttons in a browser. The branch route through the UI is Save on a note that changed on disk, then 'Save as…' out of the conflict dialog (ADR 0006), which is the shell's only path to a branch.

Before the fix, one pane holding 'payments' (last written 04:07:50Z, changed 04:08:04Z), branched to payments@option-a: the bar read 'payments | current | service | 4 elements | saved 06:08 AM'. That timestamp was the branch's, on a board the pane was not showing, and it hid the unsaved change. Notice: 'Saved payments@option-a to <file>.'

After the fix, same route to payments@option-b: 'payments | current | service | 6 elements | unsaved changes', and the notice reads 'Saved "payments@option-b" to <file>. That branches "payments", and a branch moves nothing: the only pane still holds "payments", and the branch is not on screen anywhere. Put it up beside this one with `pane open --board payments@option-b`.'

Two panes, left holding payments, branched to option-c: bar stays 'unsaved changes', notice names the left pane and offers 'board open payments@option-c --pane left' or '--pane right'.

Same-board save still clears the indicator: payments@option-b went from 'unsaved changes' to 'saved 06:12 AM'. Naming scratch still moves the pane: 'fresh2' arrived in the left pane and the notice read 'It is showing in the left pane, which held "scratch".'
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-20 04:18
---
Two things found next to this fix, neither touched.

1. Naming the scratch board leaves the dirty indicator lit even though the save succeeded. PaneStatus.lastChangeAt is per tab, not per board (frontend/src/canvas/useCanvasSession.ts), and the board switch that follows a naming bumps it after the write, so the freshly named board reads as changed since it was saved. It is not this gate: both branches of the gate end with the same savedAt, and the next plain Save clears it. It also means a pane that switches boards carries the previous board's change time into the comparison.

2. The shell has no Save-as button. The only route from the chrome to a branch is Save on a board whose note changed on disk, then 'Save elsewhere' in the conflict dialog. Every other branch has to be made from the CLI, which is why this bug survived a while.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The shell now reads what the save answer says it did. attemptSave takes saveKind, savedFrom and panes { moved, kept } off the response instead of assuming a save leaves the pane holding what was written: a same-board write and a naming of scratch update the pane's boardInfo, a branch does not and the board the pane is actually showing is re-read instead, so the dirty indicator is measured against the right baseline. The save notice is written per kind, and a branch says the branch is not on screen, names the panes still holding the source, and gives the command that puts it up, choosing 'pane open --board <branch>' while a pane can still be added and 'board open <branch> --pane <spec>' when both are full; that notice waits to be clicked away rather than timing out. Verified in a browser against a throwaway canvas: before, a branch left the bar reading 'saved 06:08 AM' for a board the pane was not showing and whose own changes were unwritten; after, the same route reads 'unsaved changes' and the notice names the pane and the command. Same-board saves still clear the indicator and naming scratch still moves the pane. bun run test and bun run type-check pass.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: TASK-079
title: >-
  A refused write does not interrupt, and the three outcomes are offered when
  the human asks
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 20:17'
updated_date: '2026-08-21 14:50'
labels: []
dependencies:
  - TASK-078
references:
  - docs/adr/0006-optimistic-concurrency-for-board-writes.md
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - frontend/src/shell/Shell.tsx
  - docs/design/server-is-the-truth.md
type: enhancement
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 8 of docs/design/the-plan.md, immediately after the store work. ADR 0006 survives ADR 0015, but the moment it fires moves, and if nothing else changes it fires at the worst possible moment.

WHAT GOES WRONG IF THIS IS NOT DONE. Today a write conflict surfaces when somebody runs `board save`, which is a moment they chose. Under ADR 0015 every change is a write, so the conflict surfaces 400 ms after a human lifts their finger, and the dialog's three outcomes read as: reload and lose what you just drew, overwrite somebody else's work, or save this somewhere else right now. Being interrupted mid-thought by a modal whose best offer is "discard what you just drew" is worse than the problem it reports.

WHY THE CONFLICT STILL EXISTS AT ALL. The lock in ADR 0016 excludes archboard processes from each other. It does not stop the Obsidian Excalidraw plugin, a sync client, or a text editor, and ADR 0016 says so: "the lock handles our own concurrency, the hash catches everybody else's."

WHAT TO BUILD. A failed write does not have to interrupt anybody.

- The write is refused, nothing is written, and the pane keeps its scene. Nothing is lost while it waits.
- The board is marked as not being persisted, visibly, so the human is not drawing into a void without knowing.
- The human keeps drawing. Further changes are held rather than written.
- The three outcomes from ADR 0006 are offered when the human asks for them, not when the conflict happened. They are unchanged: reload (`board open <name> --reload`), overwrite (`board save --board <name> --force`), or save elsewhere (`board save --board <name> --as <other>`). Archboard still picks none of them.

WHAT AN AGENT SEES. Not a dialog. A write that is refused because the note changed underneath returns the conflict, as it does today, and an agent can say so out loud. The CLI still exits 5.

THE HONEST LIMIT, WORTH WRITING DOWN WHERE A USER SEES IT. Reapplying held changes onto a note that somebody else has rewritten is a merge over a partial view: a pane's baseline covers only what that pane has seen. ADR 0006's advice stands and should be repeated in whatever this puts on screen: keep a board open in one editor at a time.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A write refused by the ADR 0006 hash check writes nothing and leaves the pane scene intact
- [x] #2 The pane shows that the board has stopped being persisted, without a modal appearing mid-gesture
- [x] #3 Changes made after a refusal are held, not written, and are not lost
- [x] #4 The three ADR 0006 outcomes are reachable at a moment the human chose, and archboard still picks none of them
- [x] #5 An agent write refused for the same reason still returns the conflict and still exits 5 from the CLI
- [x] #6 A check writes a note underneath a pane and asserts nothing was overwritten and nothing was lost
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/core/board-hold.ts: a per-board hold, in kept(). It carries the conflict that started it, when, how many writes it has taken since, and the board content itself. Beginning a hold is what a refused write does after refusing; clearing one is what an outcome does.
2. readBoardContent() answers with the held copy while a board is held. One seam, so describe, query, compare, the change feed, the panes and every route read the same board without knowing about holds.
3. persistBoard(): held boards take the write into the hold and do not touch the note or savedAt; unheld boards write as now, and a BoardWriteConflictError begins the hold and is still thrown. The write that trips it is refused clean — nothing captured — so an agent's retry is a retry and not a duplicate, and AC 1 and 5 stand.
4. The pane learns from the 409 and immediately rebases: one report carrying its whole scene, accepted only into a held board, which makes the held copy what the human is looking at rather than their note plus one gesture. Until it lands the pane renders nothing the server sends, because the premise that a reply was computed from what this pane sent is broken.
5. The mark: a chip in the board bar that says the board is not saving, and a button that summons the existing ConflictDialog. No modal fires on its own.
6. The three outcomes, each clearing the hold: open --reload takes the note and discards the held copy; save --force writes the held copy over theirs; save --as writes the held copy to another note, releases the source to their version, and moves the panes with it - a deliberate exception to ADR 0012, because staying behind means watching your own work vanish.
7. Agents: every write to a held board answers with the hold and the three commands; board list and board info carry it too. The CLI exits 5 on the refusal that starts a hold.
8. Docs: ADR 0006 gains what ADR 0015 changed about when it fires, CLAUDE.md gains the hold, the skill and the parity note.
9. check-boards gains the AC 6 block: write a note underneath, assert the refusal, assert the hold takes further writes without touching their note, then each of the three outcomes. Revert-proof and count.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
IMPLEMENTED. A refused write refuses, and then the board stops saving instead of the person being stopped.

THE SHAPE. src/core/board-hold.ts holds one record per board that has stopped saving: the conflict that started it, since when, how many writes have gone into it, and the board itself. It is in kept(), because it is the only work in the process that is in no note. readBoardContent() is the seam: a held board reads as the held copy and everything else — describe, compare, the change feed, the panes, every route — sees one board without knowing a hold exists. persistBoard() takes a write into the hold rather than the note and leaves savedAt where it was.

THE REFUSAL IS STILL A REFUSAL. The write that trips the check is refused with nothing kept, so an agent's retry is a retry and not a duplicated element, and the CLI still exits 5. Only the writes after it are taken.

WHAT THE HELD COPY IS, and the one judgement call. It starts as the note as the refused request found it, which is the other editor's version, because that is all the canvas can read. A pane holding the board then sends its whole scene as `rebase: true` on the change route, and the held copy becomes what the human is looking at — which is what makes overwrite mean what CLAUDE.md's table says it means. Starting the hold empty and waiting for that rebase was the alternative and it is wrong: a board no pane is holding would build on nothing. The rebase is the one place a browser may declare a whole board, TASK-016 having removed the other, and the server refuses it on any board that is still saving.

WHAT THE THREE OUTCOMES DO WITH THE HELD CHANGES. Reload discards them, which is what taking the note has always meant. Overwrite writes all of them. Save elsewhere writes them to the other note, releases the source to the other editor's version, and MOVES THE PANES — a deliberate second exception to ADR 0012, because staying behind means watching your own work be replaced a second after being told it was safe. Recorded in ADR 0006, in panesFollowSave's docstring and at the call site.

HOW AN AGENT LEARNS. One express middleware puts a `held` block on every answer about a held board, refusals included, so a route cannot be the one that forgot. printJson does the same for the CLI (JSON on stdout, the message on stderr) and callExcalidrawTool appends it to every MCP tool result. board list carries it too, so an agent arriving mid-session finds out without writing first.

HONEST LIMITS, written where a user sees them. A held copy is in this process and in no note, so a crash costs it; that is why the mark stays up rather than being said once. A board no pane is holding has no screen to take, so its held copy is their note plus whatever an agent drew, and held.fromScreen says which of the two you have.

CONTEXT.md gains Hold as a term, with lock and holder reserved for TASK-067: a hold is another application writing the note, a lock is another archboard writer.

REVERT PROOFS. Each change undone on its own, then the checks counted. Failing checks:

  a refusal does not stop the board saving          boards        17
  a held board still reads as its note              boards         5
  a save does not end the hold                      boards         5
  answers do not say the board stopped saving       boards         5
  a rebase merges instead of replacing              boards         2
  a reload does not end the hold                    boards         2
  a held save-elsewhere leaves the pane behind      boards         2
  a pane may declare a whole board anywhere         boards         1
  a held write counts as a save                     boards         1
  the bar does not mark a held board                live-session   5
  the pane never says what is on its screen         live-session   3
  the shell ignores the hold in a pane status       live-session   1

The last of those is a real bug this found: the shell decided a pane status was unchanged without looking at the hold, so a board that started saving again kept its mark up.

MEASURED AND UNCOVERED, said rather than hidden: the pane refusing to render board news between the refusal and its rebase (CONTENT_MESSAGES in useCanvasSession) fails 0 checks when removed. Reproducing it needs a second writer broadcasting inside the ~200 ms between the two, which nothing here can schedule reliably. What it protects against is the human seeing the other editor's scene for a moment. The second half of the same gap: a hold displayed in a SECOND pane on the same board is broadcast and handled, and no check has two panes on one held board.

VERIFICATION. bun run test, 22 steps, green, including both real-browser checks. check-boards gained the headless half — the refusal, the writes taken after it, the note untouched, the listing, the last-saved time, the rebase and its refusal on a saving board, all three outcomes, the pane that follows a held save-elsewhere, and the CLI exiting 5 and then 0. check-live-session gained the half only a rendered page can assert: another application rewrites the note mid-session, and nothing opens in front of the human, the bar reads 'not saving · 1 change held', the pane and the server still hold the same document, clicking the mark is what offers the three outcomes, and Overwrite writes the held board over their note and takes the mark down.

ENVIRONMENT, not this task: the shared node_modules has zod 4.4.3 installed under it while bun.lock pins 3.25.76, which fails type-check in four places on a clean tree (mcp-dispatch.ts:150, server.ts x3). This worktree's node_modules was replaced with per-package symlinks to the shared tree plus a real zod 3.25.76, so the suite ran against the version the lockfile names. Nothing was written to the shared tree.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-21 14:50
---
TASK-067 owns the mechanism for "this board is not accepting changes right now", and it is available to this task rather than needing a second one.

A pane is read-only when `useCanvasSession` returns `readOnly` true, which is `!connected || heldBy !== null`; `heldBy` comes from the `board_lock` message and nothing else sets it. CanvasPane passes it to Excalidraw as `viewModeEnabled`. If this task needs a pane to stop accepting a touch after ADR 0006's refusal — a note that changed on disk underneath us — the honest way is another reason for `heldBy` rather than a second read-only path beside it, because two mechanisms for one state is how they drift.

The two refusals stay separate, as ADR 0016 says: the mutex handles archboard's own concurrency and answers 409 with `code: BOARD_HELD` and a holder; the hash check catches Obsidian, a sync client and a text editor and answers 409 with `conflict` and the three outcomes. src/server.ts:boardErrorStatus and boardErrorBody handle both.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A refused write stops the board saving rather than stopping the person. Nothing is written, the board is marked in the bar as 'not saving · N changes held', drawing carries on into a copy the canvas keeps (src/core/board-hold.ts), and no second refusal arrives. Clicking the mark is what offers ADR 0006's three outcomes, at a moment somebody chose; archboard still picks none of them. Reload discards the held changes, overwrite writes them, save elsewhere writes them to another note and moves the panes with it, which is a second deliberate exception to ADR 0012 and is recorded as one.

readBoardContent is the seam, so describe, compare, the change feed and the panes all see one board. A pane says what is on its screen once, as a rebase on the change route, which is refused on any board that is still saving. An agent gets the hold, the three commands and the count on every answer about the board — API, CLI stdout and stderr, every MCP tool result and board list — and the write that trips the refusal still exits 5.

Verified by bun run test, 22 steps green with both browser checks. check-boards covers the headless half and the CLI exit codes; check-live-session covers what only a rendered page can, with another application rewriting the note mid-session: no dialog opened in front of somebody drawing, the bar said what was held, the pane and the server still held the same document, clicking the mark offered the three outcomes, and Overwrite wrote the held board over their note. Twelve reverts were measured and counted, from 17 failing checks down to 1; one uncovered guard is written down rather than claimed.
<!-- SECTION:FINAL_SUMMARY:END -->

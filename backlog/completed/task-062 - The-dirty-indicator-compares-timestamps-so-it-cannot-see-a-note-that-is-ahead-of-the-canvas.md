---
id: TASK-062
title: >-
  The dirty indicator compares timestamps, so it cannot see a note that is ahead
  of the canvas
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 19:04'
updated_date: '2026-08-22 16:31'
labels: []
dependencies:
  - TASK-078
  - TASK-067
references:
  - frontend/src/shell/Shell.tsx
  - docs/adr/0006-optimistic-concurrency-for-board-writes.md
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
  - docs/adr/0016-one-writer-at-a-time-per-board.md
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while investigating a stateless server.

frontend/src/shell/Shell.tsx around 202 decides whether a board is dirty by comparing a change time against a save time. A timestamp comparison can only answer "changed since the last save". It cannot answer "the note on disk is ahead of what this pane is holding", and it shows clean in exactly that case.

That happens whenever something else writes the note: Obsidian, a sync client, another archboard process, or a second pane on the same board saving from its own baseline. The pane keeps showing an older board and says nothing is wrong, and the next save from it writes the older content back. ADR 0006 catches that at the moment of writing, with a refusal, but the human gets no warning until then and no clue while they keep drawing on a stale copy.

What the indicator should be able to say is which of the two is ahead, not merely that they differ. archboard already records the sha-256 of a note's bytes when it reads it (ADR 0006), so the material for a real answer is on hand.

TASK-047 fixed a related bug in the same function, where a branch left boardInfo pointing at a board the pane was not showing. This is the other half: even pointed at the right board, the comparison cannot express this state.

Note that a decision on the stateless server question may remove the concept of an unsaved board altogether, in which case this indicator changes meaning rather than being fixed. Worth sequencing after that.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A note changed on disk while a pane holds an older copy is visible without running a command
- [x] #2 The indicator says what is actually true under ADR 0015: not "there are unsaved changes", which cannot happen once every write goes to the note, but "the note this pane is showing has been written by somebody else"
- [x] #3 The state clears by itself once the pane is showing the note as it now stands
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Establish what is still true after stage 8 before changing anything. Confirmed by reading the code: boardInfo is refreshed only on a board switch and on an explicit save, while under ADR 0015 every gesture writes the note, so Shell.tsx's dirty memo says 'unsaved changes' permanently after the first gesture on a board that is fully written down. It does not say less than it should, it says something false. Delete it rather than repair it.
2. src/core/board-io.ts: factor ADR 0006's comparison out of writeBoardContent into one predicate, foreignWriteTo(file, destination) - bytes are there and either archboard has never read them or they hash to something other than the baseline. The write path and the new mark call the same function, so the mark shows exactly the state in which the next write would be refused and the two cannot drift.
3. src/core/note-watch.ts: which boards on screen have had their note written by somebody else. Per-board state in kept(); a stat and baseline gate so a note is only hashed when something could have moved; announcements on transitions, not once per sweep.
4. src/core/board-lock.ts: onBoardSweep(sink), one more thing done on the beat watchBoardLocks already keeps. Same list of boards, same gating on a browser being connected. A second timer over the same list would be the same poll twice (TASK-080).
5. src/server.ts: register the sweep and the sink beside the lock ones, broadcast board_note_changed to the panes holding that board, and tell an arriving pane on the line below tellPaneAboutLock so a tab that opens onto a note already written elsewhere is not told nothing.
6. Frontend: ForeignWrite on PaneStatus, handled in useCanvasSession beside board_lock and cleared when a board_switched lands.
7. BoardBar: the dirty text and the frozen 'saved HH:MM' go. In their place a chip that says the note changed on disk, opening a dialog offering reload or carry on - two choices and not three, because nothing has been refused and there is nothing held to overwrite with. A hold still wins the slot.
8. Docs: CONTEXT.md gains the term, ADR 0006 gains the mark before the refusal, CLAUDE.md gains the paragraph.
9. scripts/check-boards.mjs: assertions beside TASK-079's block - a note written underneath shows up without a write, a pane arriving is told, reload clears it, and a held board says hold rather than this. Then revert each mechanism and count.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
IMPLEMENTED, and the task's own title stopped being the problem.

WHAT WAS ACTUALLY TRUE AFTER STAGE 8, established by reading rather than assuming. The dirty indicator did not merely say too little. It lied. `boardInfo` is refreshed on a board switch and after an explicit save and at no other moment (Shell.tsx), while under ADR 0015 every gesture is written to the note, so `lastChangeAt > savedAt` was permanently true after the first gesture of a session. The bar read `unsaved changes` for the rest of that session about a board that was entirely in the vault. So it is deleted, not repaired, and a board that is saving now says `in the vault`.

WHAT REPLACED IT. `note changed on disk · HH:MM`, while somebody outside archboard has written the note this pane's board came from. Clicking it opens a dialog with two answers, not three: taking the note, and carrying on. Nothing has been refused, so there is no held copy to overwrite the note with and none to save elsewhere, and those two outcomes become reachable through the hold the moment the person's next gesture is refused. Cancel is what focus lands on, because the pane's scene is at that moment the only copy left of the board archboard last wrote, and a chip that reloaded on tap would end it with one stray touch on a 75-inch panel.

ONE COMPARISON, NOT TWO. `foreignWriteTo(file, destination)` is ADR 0006's check lifted out of `writeBoardContent`, and both callers use it: the write, which already holds the bytes, and the sweep, which reads them. The mark's whole claim is that it shows the state in which the next write would be refused, and a second implementation of that question is one that drifts. check-boards asserts the two agree rather than trusting the refactor.

IT IS NOT A SECOND POLL. It rides on `watchBoardLocks`'s sweep through a new `onBoardSweep` passenger, so it inherits the list of boards on screen and the gating on a browser being connected (TASK-080). A note is read and hashed only when its size or its modification time has moved, or when archboard's own baseline for it has - the third because taking the note changes what the comparison is against without touching the file. A stat difference means the note is worth looking at and never that it changed; only the hash decides, because a false positive puts a mark on somebody's board saying their work is behind when it is not.

A VERSION COUNTER WAS CONSIDERED AND IS WRONG, recorded in ADR 0006. Obsidian and archboard both carry unknown frontmatter across a save verbatim, so a foreign edit leaves the number where it was and archboard overwrites. `git pull` can also move a note to a lower number, or to different content at the same one. The hash needs nobody's cooperation.

THE BUG THE BROWSER CHECK FOUND, which no socket could have. The message arrived, the pane's ref was set, and the bar never changed: the shell's status dedup skips an update when nothing it compares has moved, and this was the only thing that moves about a pane when it happens. The hold's own comment already recorded that this had eaten one mark; it has now eaten two, and the comparison says so.

REVERT PROOFS. Each mechanism undone on its own, then the checks counted. Every run reached its report line.

  check-boards.mjs
    the mark never goes up                                   7
    the mark's reason detached from the refusal's            4
    the sweep passenger unregistered                         2
    an arriving pane not told                                2
    a hold no longer outranks it                             1
    the stat and baseline gate defeated                      1
    the announcement dedup removed                           1

  check-live-session.mjs (a real headless browser)
    the shell's status dedup fix removed                     1
    the chip not rendered                                    1
    the old 'unsaved changes' text put back                  1

VALIDATION. `bun run test` green, 23 steps. Six full-suite runs on this branch; two of them failed check-live-session at cycle 12 with an agent-move/human-move divergence on one element. Chased rather than waved through: the announcement log shows the sweep sends no message at all during the 42 cycles, standalone runs pass 7 of 7 on this branch and 4 of 4 on the baseline commit, and the last three full-suite runs are clean. No mechanism connects a once-a-second stat to a 400 ms convergence window. Reported as an existing flake in that check under load rather than as a cost of this change.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-20 19:12
---
Correction from the coordinator. When filing this I wrote that it explained an incident earlier in the session, where the canvas held 45 and 34 elements while the notes held 55 and 50. That link is wrong and I have removed it.

In that incident the canvas was ahead of the notes, not behind them: a Codex session had cut edges and those deletions were unsaved, which is why memory had fewer elements than disk. Fewer elements meant newer, not older. A timestamp comparison handles that direction correctly, and the shell did show "unsaved changes" at the time.

The limitation this task describes is real and worth fixing. It just was not the cause of that incident, and saying so would have sent whoever picks this up looking for a reproduction that does not exist.
---

created: 2026-08-20 20:10
---
Reconciled against ADR 0015 and ADR 0016 (2026-08-20).

Verdict: changed in nature. Half of it is superseded, half of it survives and
gets more important. Acceptance criterion 1 rewritten; criterion 2 kept.

The task's own last paragraph anticipated this: "a decision on the stateless
server question may remove the concept of an unsaved board altogether". ADR
0015 made that decision. Under it there is no unsaved board, because every
write goes to the note, so "the canvas is ahead of its note" is a state that
cannot happen. Acceptance criterion 1 asked the indicator to distinguish two
directions and one of them is being deleted.

What survives is the other direction, and it survives intact. The note can
still be ahead of what a pane is holding, because ADR 0016 is explicit that a
lock file stops archboard processes and does not stop the Excalidraw plugin, a
sync client, or a text editor. ADR 0006's hash check stays for exactly those
writers, and it still only fires at the moment of writing. So the gap this task
describes, a human drawing on a stale copy with nothing on screen saying so,
is unchanged and is now the whole of the task.

Two things make the answer easier than it was when this was filed:

- ADR 0016 already pushes lock state to every pane holding a board, so there is
  a socket message about board ownership going to exactly the right panes. What
  this needs is one more fact on it.
- Under ADR 0015 the server re-reads the note per write rather than once per
  session, so "the note changed underneath us" is detected within one write
  rather than at the next save.

The current implementation is unchanged and still at `frontend/src/shell/Shell.tsx:200-207`:
a `new Date(changed).getTime() > new Date(boardInfo.savedAt).getTime()` compare.

Sequencing: after the stage that makes the note the truth (stage 7 of
docs/design/the-plan.md) and after the mutex, because both of them decide what
the indicator has to say. Do not start this before them; the thing being
indicated does not exist yet in its final form.
---

created: 2026-08-20 20:18
---
Correction to the comment above: the stage that makes the note the truth is stage 8 of docs/design/the-plan.md, not stage 7, and this task is in stage 9. The sequencing it describes is unchanged: after TASK-078 and after TASK-067, both now recorded as dependencies.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The board bar says a note somebody else wrote, before the write that would be refused.

Half of what this task asked for stopped existing at stage 8, and the half that remained was being answered with something false: the dirty indicator compared a change time against a save time that only refreshed on a board switch, so it read 'unsaved changes' from the first gesture of a session onwards about a board every gesture had already written to the vault. That is gone. A board that is saving says 'in the vault'.

What is on screen now is the state no lock covers: Obsidian, a sync client or a git pull has written the note, and the pane is showing the board archboard last wrote. The chip says 'note changed on disk' with the time, and clicking it offers taking the note or carrying on, which are the only two answers before anything has been refused. It comes off foreignWriteTo, ADR 0006's own comparison factored out of writeBoardContent, so the mark is the state the next write would be refused in rather than a second guess at it. A hold outranks it, being the same story one write later; a lock is a different fact and is still said by the pane going read-only.

Noticing rides on the lock watcher's sweep rather than a timer of its own, so it inherits TASK-080's gate on a browser being connected, and a note is read and hashed only when its size, its time or archboard's baseline for it has moved.

Verified in a real headless browser (check-live-session): the bar reads 'in the vault' and claims nothing unsaved, then 'note changed on disk' after a note is rewritten underneath with nothing written and no command run, with no dialog and nothing held. The rules, the gate, the hold precedence and the clearing are asserted in process and on the wire in check-boards. Ten separate reverts counted, 7/4/2/2/1/1/1 failing checks in check-boards and 1/1/1 in check-live-session, every run reaching its report line. bun run test green.
<!-- SECTION:FINAL_SUMMARY:END -->

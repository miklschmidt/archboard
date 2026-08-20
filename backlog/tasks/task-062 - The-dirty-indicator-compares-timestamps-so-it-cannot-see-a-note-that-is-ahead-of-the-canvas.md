---
id: TASK-062
title: >-
  The dirty indicator compares timestamps, so it cannot see a note that is ahead
  of the canvas
status: To Do
assignee: []
created_date: '2026-08-20 19:04'
updated_date: '2026-08-20 20:18'
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
- [ ] #1 A note changed on disk while a pane holds an older copy is visible without running a command
- [ ] #2 The indicator says what is actually true under ADR 0015: not "there are unsaved changes", which cannot happen once every write goes to the note, but "the note this pane is showing has been written by somebody else"
- [ ] #3 The state clears by itself once the pane is showing the note as it now stands
<!-- AC:END -->

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

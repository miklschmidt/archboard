---
status: accepted
---

# The note decides, and a person's edit is optimistic

Supersedes, in part, [ADR 0006](0006-optimistic-concurrency-for-board-writes.md)
and [ADR 0016](0016-one-writer-at-a-time-per-board.md). Tracked as TASK-152.

Both earlier decisions grew a second rule beside the one they record: that a
person at the canvas is never refused. ADR 0006 exempts a person from the
version precondition; ADR 0016 lets any content gesture revoke an agent's
claim so the wall never stops responding, and asks agents to restructure in
view of the person. That rule was a product misunderstanding. It let a pane
show a board the note does not hold, and it made a person's touch decide what
an agent may do to a board the person may not even be looking at.

## Decision

**There is one source of truth, the note on disk** (ADR 0015). Nothing a pane
shows is a second copy with its own authority.

**A person's edit is an optimistic update, and nothing more.** The canvas
applies the gesture immediately so the display feels direct, and the pane
writes it with the version it last saw, like every other archboard writer.
When the note has moved since, the write is refused with the same version
conflict an agent gets, and the pane reconciles to the note: the optimistic
change is withdrawn and the note's state is shown. A person's pane must never
drift from the note. Refusal is not a failure of the experience; it is the
experience being honest, and the version check runs for everyone.

**A claimed board is read-only to people while the claim stands.** When an
agent claims a board, every pane showing it stops accepting content edits.
Panning and zooming keep working, so a person can watch and read; the pane is
in Excalidraw's view mode, which takes selection with it.
A content gesture no longer revokes the claim. A person who wants the board
back uses one explicit control that releases the claim, and the agent is told
it lost the board, as ADR 0016 already says.

**An agent may edit any board, watched or not.** The agent's work is not
steered toward what a person is looking at, and it is not asked to keep a
restructure in view. What every pane owes the person instead is real-time
visibility: which board an agent holds and what it said it is doing, including
boards no pane has open. The `--doing` line on every agent write stays
(ADR 0016, TASK-095); a person is still never asked to write one.

## What remains from the earlier decisions

- ADR 0006: the hash catches foreign writers and the version orders
  archboard's own; the held-board outcomes after a refusal are unchanged. Only
  the sentence "a person is never checked at all" is withdrawn.
- ADR 0016: one writer at a time, the lease beside the note, the canvas
  renewing a claim, the broadcast of lock state, and the agent being told once
  when it loses the board. Withdrawn: a person's content gesture as takeover
  (TASK-118), and the guidance that exclusion is never licence to work out of
  sight.

---
status: accepted
---

# The note decides, and a person's edit is optimistic

Canonical subject claims and complete revisions supersede board leases and document versions below. The browser reads architecture and retains human claim take-back.
[ADR 0062](0062-one-live-canonical-model-and-consumer-path.md) records this replacement and remains proposed pending TASK-549.24 parent acceptance.
The original decision below remains historical evidence.

Amended by [ADR 0051](0051-a-person-can-move-a-board-to-another-repository.md)
(2026-10-14). A person can move a board to another repository. With the
take-back, that is the second write that a browser makes to a board. Everything
else stands.

Supersedes, in part, [ADR 0006](0006-optimistic-concurrency-for-board-writes.md)
and [ADR 0016](0016-one-writer-at-a-time-per-board.md). Tracked as TASK-152.

Both earlier decisions grew a second rule beside the one they record. The rule
was that a person at the canvas is never refused. ADR 0006 exempts a person from
the version precondition. ADR 0016 lets any content gesture revoke the claim of
an agent, so the wall never stops responding. It also asks agents to restructure
in view of the person.

That rule was a product misunderstanding. It let a pane show a board that the
note does not hold. It also made the touch of a person decide what an agent can
do to a board. This held whether or not the person looked at the board.

## Decision

There is one source of truth, the note on disk (ADR 0015). Nothing that a pane
shows is a second copy with its own authority.

A person's edit is an optimistic update, and nothing more. The canvas applies
the gesture immediately, so the display feels direct. The pane writes the edit
with the version that it last saw, like every other archboard writer.

If the note moved since, the write is refused with the same version conflict
that an agent gets. Then the pane reconciles to the note: it withdraws the
optimistic change and shows the state of the note. A pane of a person must never
drift from the note. Refusal is not a failure of the experience. It is the
experience being honest, and the version check runs for everyone.

While a claim stands, a claimed board is read-only to people. If an agent claims
a board, every pane that shows it stops accepting content edits. Panning and
zooming keep working, so a person can watch and read. The pane is in the view
mode of Excalidraw, which takes selection with it.

A content gesture no longer revokes the claim. A person who wants the board back
uses one explicit control that releases the claim. The agent learns that it lost
the board, as ADR 0016 already says.

An agent can edit any board, watched or not. Nothing steers the work of the
agent toward what a person is looking at, and nobody asks the agent to keep a
restructure in view. Every pane owes the person real-time visibility instead.
The pane shows which board an agent holds and what the agent said it is doing.
This includes boards that no pane has open. The `--doing` line on every agent
write stays (ADR 0016, TASK-095), and nobody asks a person to write one.

## What remains from the earlier decisions

From ADR 0006, the hash still catches foreign writers and the version still
orders the writes of archboard itself. The held-board outcomes after a refusal
are unchanged. This decision withdraws only the sentence "a person is never
checked at all".

From ADR 0016, these rules stay: one writer at a time, the lease beside the
note, the canvas renewing a claim, and the broadcast of lock state. An agent
that loses the board is still told once. This decision withdraws two things. A
person's content gesture as takeover is gone (TASK-118). The guidance that
exclusion is never a license to work out of sight is gone too.

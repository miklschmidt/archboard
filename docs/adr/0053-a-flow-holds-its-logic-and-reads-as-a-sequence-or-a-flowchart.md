---
status: accepted
---

# A flow holds its logic, and reads as a sequence or as a flowchart

Independent canonical flow collections supersede board-owned flows below. Sequence and flowchart still require a complete explicit authored exchange.
[ADR 0068](0068-one-live-canonical-model-and-consumer-path.md) records this replacement and remains proposed pending TASK-549.24 parent acceptance.
The original decision below remains historical evidence.
[ADR 0073](0073-a-flowchart-lays-out-from-its-flow-and-a-flow-opens-in-the-reading-that-fits.md) replaces its track engine layout of the flowchart.

Decided for TASK-350 on 2026-10-16. The owner asked for "a flow chart diagram
that shows logic". [ADR 0052](0052-a-board-opens-on-its-overview.md) moved calls
out of relationships and into flows, so a flow now carries most of what a board
says about behaviour.

## Context

A flow was a list of messages. A branch or a loop of unknown length was a
`note` on one message, which no picture drew and no comparison could read. A
request that asked "what happens if the lease is held" got prose beside an
arrow. The grammar `data-flow` drew a sequence diagram, and its name said
something else.

## Decision

A step of a flow is one of three things:

- A message: `from`, `to`, `label` and a `kind`, as before. A message stated
  without a `kind` is `sync`.
- A decision: `kind: "decision"`, a `question`, and two or more
  `alternatives`. Each alternative has its own `label` and an ordered list of
  `steps`. At least one alternative holds a step. The alternatives rejoin
  after the decision: the step after it follows every alternative.
- A loop: `kind: "loop"`, a `condition`, and the `steps` it repeats, at least
  one.

A decision or a loop holds steps of all three sorts, so a flow is a tree told
in order. Decisions and loops belong to the flow, never to a part: a part does
not branch, an exchange does.

Each step is a subject of its own with a minted id, as a message is. A restated step that
names its id keeps it. Comparison and reconciliation read the tree flat: each
step alone, in document order, with `within` naming the decision alternative
or loop that holds it. A step moved into another alternative changed its
`within`. A merge or a restore builds the tree again from the flat list. A
merge that leaves a decision or a loop with nothing to hold is reported as
`left-empty`, and the merged content keeps this proposal's steps. A decision
or loop the merge newly holds stands right before the first step it holds.
A merged list that no tree reads back in the same order, such as a step one
side put between two steps the other side moved into a loop, is reported as a
`competing-order` of the whole flow (TASK-484). The merged content keeps this
proposal's steps there too.

One flow has two readings, chosen by the view's grammar:

- `sequence` (formerly `data-flow`): participants in columns and every message
  in order.
- `flowchart`: the flow's steps from a start to an end, top to bottom.
  The track engine (TASK-349) lays it out, because its top-to-bottom tracks fit
  a flow that branches and rejoins. The start, the end and the lines belong to
  the picture and are no subjects.

The grammar `data-flow` is renamed `sequence`. Schema 2.5.0 migrates every
stored view on read, and the store writes the migration under the board's
lease. A payload that still says `data-flow` is refused with the new name.

## Consequences

- A branch or a loop of unknown length is no longer a `note`. `repeat` stays
  for a count that the source fixes on one message.
- Every reader that wants the messages alone (a code check of anchors, step
  lines on an architecture picture, a footprint) reads them through
  `messagesOf`, in the order a run that took every alternative once would meet
  them.
- A flow does not name its start and end. The flowchart draws them from the
  first and the last step.

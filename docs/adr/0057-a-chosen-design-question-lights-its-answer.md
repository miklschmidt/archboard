---
status: proposed
---

# A chosen design question lights its answer

TASK-537.02 records this decision, which the owner made on 2026-10-25. It
serves TASK-537 and its subtask TASK-537.03. It amends ADR 0044 and ADR 0045.

Revised with the owner on 2026-10-25, after the first build. The first build lit
the whole answer at once. In the Overview it lit three closed containers while
the Board tab named five entry points that nobody could see. In Everything the
five lit cards were too small to read. The owner chose a step through the
answer instead. The decision below is the revised one.

## Context

The Board tab lists design questions (TASK-537.01). A design question asks
where understanding or changing the code takes more work than its job needs.
Its answer is a list of subjects: for example, the entry points that only pass
one call on. A list of names still leaves the person to find each part on the
picture. The Overview draws every container closed (ADR 0052), so many answers
sit inside a container that the view does not open.

Two clauses stop the picture from helping. ADR 0044 says that a pass-through
entry point has no mark of its own in the picture. ADR 0045 says that the pane
inspector is the one place where a user sees a reading of the history lens.

## Decision

A person goes through a design question's answer one subject at a time. Each
result of the question is a step. A step lights every subject of the answer and
the containers that hold them. It also lights what a pick of the step's subject
lights: its relationships and the parts at their other ends. For a pass-through
entry point, those are its callers and the one call it passes on, which is what
the question asks about. The rest recedes. The step's subject carries the ring
of attention, as a walkthrough step's subjects do. The camera frames the
subject with the parts at the other ends of its relationships. If the view on
screen does not draw the subject, the pane opens Everything first.

A step is not a pick, so the Board tab stays open and the next result is one
click away. Choosing the current result again lets the question go.

This is attention, as Light and Trace are. The ring is the ring that a pick and
a walkthrough step already carry. Neither is a mark, a colour or a channel of
its own, so ADR 0025 still holds: every visual channel is taken. Nothing is
written. Letting the question go takes the light away. A pick shows its own
Light and ring, and letting go of the pick brings back the step. A pick, a
group or a walkthrough step takes the place of the question, as each takes the
place of the others.

ADR 0044 is amended: a pass-through entry point still has no mark of its own,
but a chosen design question can light it. ADR 0045 is amended: a reading shows
in the pane inspector, and a design question that a person chose can light the
subjects that it names. The reading itself still shows only in words.

These rules still hold:

- History sets no traffic, emphasis, colour or mark (ADR 0027, ADR 0045).
- History is never read on a timer (ADR 0045).
- A pane never starts a code pass (TASK-367.24).
- A design question gives counts and names. It gives no score, no combined
  number and no verdict such as deep or shallow (ADR 0044).

## Considered options

- A mark on each pass-through entry point. Rejected, because every visual
  channel is taken (ADR 0025), and a mark says that the part is at fault.
- The list alone. Rejected, because the person must still search the picture,
  and a closed container hides most answers.
- The whole answer lit at once, with a hidden subject lit through its closed
  container. Built first and rejected by the owner: a lit container does not
  show where its subjects are, and the whole board fitted on screen is too
  small to read.
- A result that picks its part, as before. Rejected, because a pick opens the
  Selection tab, and the next result is then two clicks away.

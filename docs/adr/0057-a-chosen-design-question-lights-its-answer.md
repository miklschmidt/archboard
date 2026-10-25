---
status: proposed
---

# A chosen design question lights its answer

TASK-537.02 records this decision, which the owner made on 2026-10-25. It
serves TASK-537 and its subtask TASK-537.03. It amends ADR 0044 and ADR 0045.

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

When a person chooses a design question, the picture lights its answer. The
subjects of the answer, and the containers that hold them, stay as drawn. The
rest recedes. A subject that the view does not draw is lit through the nearest
container that the view draws.

This is attention, as Light and Trace are. It is not a mark, a colour or a
channel of its own, so ADR 0025 still holds: every visual channel is taken.
Nothing is written. Letting the question go takes the light away. A pick shows its
own Light, and letting go of the pick brings back the light of the question. A
pick, a group or a walkthrough step takes the place of the question, as each
takes the place of the others.

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

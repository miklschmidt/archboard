---
status: accepted
---

# The renderer reads a board in a direction and is measured by fit in the reader's pane

ADR 0023 records that PR Lens's layout was chosen for its clarity and finish,
that fitting one viewport is not a success criterion, and that no density
policy is wanted. The compound layout of 2026-09-13 replaced PR Lens's grid
with ELK and renderer-owned reading conventions, and the 27 renderer commits
after TASK-211 re-decided pieces of that layout one board at a time with
nothing on record, because the ADR ruled the question out: a tall, narrow
column was never a failure by any recorded criterion, and the one direction
the layout could read in was a literal in one line of code. This decision,
accepted on 2026-09-16 under TASK-245, supersedes those paragraphs of
ADR 0023 and records what the renderer decides about a board's reading.

Reading direction, fit and reference pane are defined in
[CONTEXT.md](../../CONTEXT.md#reading). The decisions below govern how the
renderer uses them.

## The layout is ELK with reading conventions the renderer owns

The architecture grammar is laid out by ELK's layered algorithm. What the
renderer decides itself is the reading of the board, expressed as conventions
rather than geometry: an adjacent forward step leaves the source ahead and
enters the target from behind, a return travels along the flank, a
relationship between a frame and a part inside it is the frame's own and
crosses no outer face, and a forward skip carries no convention and is the
engine's to attach. The conventions are stated in reading terms, and a
direction maps them to compass faces in one place. Anything that reads
geometry to repair a face chosen before the engine has placed a card is a
guess, and a guess is replaced by another solve, never by another rule.

PR Lens remains the origin of the measurement, the painting and the
message-sequence grammar; its grid is not the architecture layout and the
ADR 0023 sentence that chose it for that purpose no longer governs.

## A view's reading direction is the renderer's

A view reads down the page or left to right. Which one is derived from the
board: a first render solves both and keeps the one that fits the reference
pane better, ties going down the page, and a proposal keeps its predecessor's
direction so a comparison and the transition between two pictures of one
board keep the reader's bearings. The direction is recorded on the drawing so
the atlas, the measure script and the tests can read it, and it is never
authored, stored in a board or chosen by a person.

[ADR 0032](0032-every-variant-is-laid-out-fresh.md) supersedes the predecessor
direction rule above: every variant now chooses its own fresh layout.

## Fit in the reference pane is the measure

A layout change is measured by how the drawing fits the reference pane,
together with the reader invariants: no route through a card, no fan of skips
down a flank, bounded bends per route, and every label on a straight run of
its own route. Fit is the scale at which the whole drawing shows in the pane,
capped at one, the same arithmetic the viewer's fit uses. The reference pane
is derived from the desktop shell the product supports (1920 by 1080, the
navigator and the inspector open, the fit margin on every side), about 1272
by 952 diagram units, and is defined once where the test and the measure
script both read it.

This replaces ADR 0023's clauses that fitting the whole diagram in one
viewport is not a success criterion and that no density policy is wanted.
A drawing that fits at 0.4 is still drawn and still navigable; the measure is
what a change to the layout is judged by and what the layout suite holds,
not a refusal and not a partitioning policy. Page area is not the measure: a
column and a ribbon of the same area fit the pane at 0.65 and 0.32.

## What an agent may not author is the list, and only the list

ADR 0023 forbids agents four things: coordinates, font sizes, colours and
connector routes. That list is the whole rule. Containment, ordered flows, a
flow's participant order, focal subjects and the diagram grammar are
presentation intent the same ADR accepts, and a board that states them is
not making an exception. The renderer's stricter paraphrase, that no rank
hint may exist because a rank hint is a coordinate in disguise, is not the
rule; the rule is that rank and direction are the renderer's to derive from
the board, which is what this ADR decides. Adding a direction or a rank to the
board would be a new decision against this one, not a violation of the list.

## Consequences

- Renderer tests that pinned rows or compass faces are re-derived as
  direction-neutral reader invariants, so a change of direction is not a
  change of what the tests hold.
- `docs/design/layout-rules.md` keeps the dated record of every layout change
  and of what was measured and rejected; a layout task reports fit before and
  after, not megapixels.
- The wide-board suite owns fit on the three fixtures and the vault's boards,
  with a small allowance over the recorded baseline.

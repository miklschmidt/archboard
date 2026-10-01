---
status: accepted
---

# The renderer reads a board in a direction and is measured by fit in the reader's pane

ADR 0023 records that PR Lens's layout was chosen for its clarity and finish. It
records that fitting one viewport is not a success criterion. It also records
that no density policy is wanted. The compound layout of 2026-09-13 replaced PR
Lens's grid with ELK and renderer-owned reading conventions. The 27 renderer
commits after TASK-211 re-decided pieces of that layout one board at a time.
They left nothing on record, because the ADR ruled the question out. A tall,
narrow column was never a failure by any recorded criterion. The one direction
that the layout read in was a literal in one line of code. This decision,
accepted on 2026-09-16 under TASK-245, supersedes those paragraphs of ADR 0023
and records what the renderer decides about a board's reading.

Reading direction, fit and reference pane are defined in
[CONTEXT.md](../../CONTEXT.md#reading). The decisions below govern how the
renderer uses them.

## The layout is ELK with reading conventions the renderer owns

[ADR 0033](0033-graphviz-placement-and-obstacle-routing.md) supersedes this
engine choice and its attachment conventions with Graphviz placement and
libavoid routing. The following paragraphs record the earlier decision.

ELK's layered algorithm lays out the architecture grammar. The renderer itself
decides the reading of the board. It expresses the reading as conventions rather
than geometry:

- An adjacent forward step leaves the source ahead and enters the target from
  behind.
- A return travels along the flank.
- A relationship between a frame and a part inside it is the frame's own and
  crosses no outer face.
- A forward skip carries no convention and is the engine's to attach.

The conventions use reading terms, and a direction maps them to compass faces in
one place. Anything that reads geometry to repair a face that the engine chose
before it placed a card is a guess. The fix for a guess is another solve, never
another rule.

PR Lens remains the origin of the measurement, the painting and the
message-sequence grammar. Its grid is not the architecture layout. The ADR 0023
sentence that chose it for that purpose no longer governs.

## A view's reading direction is the renderer's

A view reads down the page or left to right. The renderer derives which one from
the board. A first render solves both and keeps the one that fits the reference
pane better. Ties go down the page. A proposal keeps its predecessor's
direction, so a comparison and the transition between two pictures of one board
keep the reader's bearings. The drawing records the direction, so the atlas, the
measure script and the tests can read it. Nobody authors it, no board stores it,
and a person never chooses it.

[ADR 0032](0032-every-variant-is-laid-out-fresh.md) supersedes the predecessor
direction rule above. Every variant now chooses its own fresh layout.

## Fit in the reference pane is the measure

[ADR 0039](0039-a-drawing-is-measured-by-how-easily-it-reads.md) supersedes this
section. A drawing is measured first by how easily it reads, and fit is a
guideline that breaks ties. The following paragraphs record the earlier
decision.

Two things measure a layout change: how the drawing fits the reference pane, and
the reader invariants. The reader invariants are these:

- No route goes through a card.
- No fan of skips runs down a flank.
- Each route has a bounded number of bends.
- Every label sits on a straight run of its own route.

Fit is the scale at which the whole drawing shows in the pane, capped at one. It
uses the same arithmetic as the viewer's fit. The reference pane is derived from
the desktop shell that the product supports. That shell is 1920 by 1080, with
the navigator and the inspector open and the fit margin on every side. The pane
is about 1272 by 952 diagram units. It is defined once, in a place that the test
and the measure script both read.

This replaces ADR 0023's clauses that fitting the whole diagram in one viewport
is not a success criterion and that no density policy is wanted. A drawing that
fits at 0.4 is still drawn and still navigable. The measure is what a layout
change is judged by and what the layout suite holds. It is not a refusal and not
a partitioning policy. Page area is not the measure. A column and a ribbon of
the same area fit the pane at 0.65 and 0.32.

## What an agent must not author is the list, and only the list

ADR 0023 forbids agents four things: coordinates, font sizes, colors and
connector routes. That list is the whole rule. Containment, ordered flows, a
flow's participant order, focal subjects and the diagram grammar are
presentation intent that the same ADR accepts. A board that states them makes no
exception.

The renderer's stricter paraphrase says that no rank hint is allowed. Its reason
is that a rank hint (an authored hint for the row of a card) is a coordinate in
disguise. That paraphrase is not the rule. The rule is that rank and direction
are the renderer's to derive from the board, which is what this ADR decides. A
direction or a rank added to the board is a new decision against this one, not a
violation of the list.

## Consequences

- The renderer tests that pinned rows or compass faces are re-derived as
  direction-neutral reader invariants. So a change of direction is not a change
  of what the tests hold.
- `docs/design/layout-rules.md` keeps the dated record of every layout change
  and of what was measured and rejected. A layout task reports fit before and
  after, not megapixels.
- The wide-board suite owns fit on the three fixtures and the vault's boards,
  with a small allowance over the recorded baseline.

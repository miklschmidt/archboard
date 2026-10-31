---
status: superseded by ADR-0070
---

# Parent headers use normal card sizing

Superseded on 2026-10-31 by [ADR 0070](0070-doors-are-buttons-and-every-relationship-has-a-line.md).
The owner chose an edge tab (TASK-559.14), so no frame holds a header card.
The context below stays true of a wide header: it blocks routes to a frame's members.

TASK-548.11 proposes this decision on 2026-10-27 within the next TASK-548.08 council round.
The parent council judges the changed drawings before adoption.

## Context

A header card names a parent inside its frame.
ADR 0044 puts that slab across the frame, with the same inset at both sides.
TASK-486 also widens its words when the frame grows.
The full-width slab blocks otherwise direct routes to the parent's members.
Avoiding it sends lines around frames and spreads collaborators apart.
The second council round rejects four pictures with that cost.

The owner keeps header crossings as hard defects.
A composition must give a short route a clear passage beside the header.

## Decision

A parent header uses the normal card width rules and wraps its text to that width.
It keeps one measured size instead of expanding across the frame.
The frame encloses its members independently of the header's width.
Layout and painting use the same measured header box in both engines and every theme.
A line naming the parent ends on that visible card.
A line to a member can enter through the free top edge beside the card.

A parent's name uses 15 px text instead of 14 px, with the existing medium face.
Its icon uses 20 px instead of 18 px inside the existing chip.
The far view also adds 1 px to the name sizes that fit its tile.
The responsibility, neutral header face, chip size, and frame treatment remain.
The core measures the larger name before layout and paints those measured glyphs.
The emphasis introduces no extra font face or host text measurement.

This replaces the full-width placement in ADR 0044 and the frame-dependent widening of TASK-486 described in ADR 0039.
It refines ADR 0061's protected header box to the compact card that is actually painted.
The Rust core, Solver port, and Graphviz decisions of ADR 0059 and ADR 0060 remain.

## Consequences

Large frames no longer create equally large obstacles across their top edges.
Related cards can keep direct routes without crossing the header.
The layout still must compose members tightly and reserve clear label and route space.
The existing endpoint, card, label, frame, header, and trunk checks remain hard requirements.
The design note records the four acceptance pictures, corpus changes, and speed evidence.

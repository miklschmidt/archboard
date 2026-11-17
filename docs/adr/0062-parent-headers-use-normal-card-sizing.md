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
The slab spans the frame, with the same inset at both sides.
The full-width slab blocks otherwise direct routes to the parent's members.
Avoiding it sends lines around frames and spreads collaborators apart.

## Decision

A parent header uses the normal card width rules and wraps its text to that width.
It keeps one measured size instead of expanding across the frame.
The frame encloses its members independently of the header's width.

This replaces the full-width placement and the frame-dependent widening of TASK-486 described in ADR 0039.
It refines the protected header box to the compact card that is actually painted.
The Rust core, Solver port, and Graphviz decisions of ADR 0059 and ADR 0060 remain.

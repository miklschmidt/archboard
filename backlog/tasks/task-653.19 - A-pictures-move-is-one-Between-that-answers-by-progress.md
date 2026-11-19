---
id: TASK-653.19
title: A picture's move is one Between that answers by progress
status: To Do
assignee: []
created_date: '2026-11-19T17:34:00Z'
updated_date: '2026-11-19T17:34:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-653.18
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1133000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 6 of the archboard-deepen run, third on the Rust track. Picture motion (crates/archboard-paint/src/between/mod.rs) is wide (22 names): carry and entrance are separate types with the same shape, and Flight does the move's arithmetic for it. The move becomes one Between with carry and enter constructors, sampled by progress; ADR 0071 stays untouched. The settled design, every decision and its reason: the "Candidate 6, Picture motion: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md (its "Settled by the orchestrator" points override the advisors where they differ), and the tree tree-06-motion.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout).

## Architecture

- Proposal: sL6y1FLr ("Deepen the wide and shallow modules"); this ticket builds its slice.
- Slice: Picture motion (crates/archboard-paint/src/between), its callers in the stage and flight layer (crates/archboard-paint/src/stage, flight.rs, passage.rs, timing.rs, lens.rs, arrival.rs).
- Gate: before this ticket merges, `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state sL6y1FLr --model-at checkout --fail-outside` exits 0, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on Picture motion and archboard-paint.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Picture motion exports exactly Between, carry, enter, length, at, definitions, seen_at, focus, holder_at, rebase, departing and frame_of (width 12), all methods in one impl; INTERFACE_WIDE clears
- [ ] #2 at(p) returns (Vec<Item>, Vec<Mask>) and definitions() is separate, so the move holds no state between samples; the definitions index lives in Arriving and the caller runs replace_masks before using the items
- [ ] #3 enter(to, phases, Option<Handover>) returns the filtered ghost body when subjects flew and None keeps the empty-set fast path; Handover carries { last, gone } and visible_at is private; focus(p) returns Option<Focus::{Entrance(f64), Door(Rect, f64)}> with progress capped once inside, and a retained tray answers None
- [ ] #4 Flight becomes a match-free Arriving { between, definitions, time }; the dive samples Between by path progress; phase moves to crate::timing; Heading sits beside passage's Side; departure folds into departing
- [ ] #5 Existing move tests switch to the new constructors with their assertions unchanged; entrance_order.rs:115 asserts against visible_at(gone); new seam tests show a carry ignores rebase and answers no holder, no flown subjects and no tray, and an entrance answers no door
- [ ] #6 Hashes of the move's answers over the corpus at progresses 0 to length and candidate 3's CPU frame hashes are identical before and after, and the site audit passes
- [ ] #7 A short ADR records the rejected alternatives, and ADR 0071 is unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr
<!-- SECTION:NOTES:END -->

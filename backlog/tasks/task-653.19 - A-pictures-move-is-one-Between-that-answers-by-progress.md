---
id: TASK-653.19
title: A picture's move is one Between that answers by progress
status: Done
assignee: []
created_date: '2026-11-19T17:34:00Z'
updated_date: '2026-11-19T20:26:00Z'
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
- [x] #1 Picture motion exports exactly Between, carry, enter, length, at, definitions, seen_at, focus, holder_at, rebase, departing and frame_of (width 12), all methods in one impl; INTERFACE_WIDE clears
- [x] #2 at(p) returns (Vec<Item>, Vec<Mask>) and definitions() is separate, so the move holds no state between samples; the definitions index lives in Arriving and the caller runs replace_masks before using the items
- [x] #3 enter(to, phases, Option<Handover>) returns the filtered ghost body when subjects flew and None keeps the empty-set fast path; Handover carries { last, gone } and visible_at is private; focus(p) returns Option<Focus::{Entrance(f64), Door(Rect, f64)}> with progress capped once inside, and a retained tray answers None
- [x] #4 Flight becomes a match-free Arriving { between, definitions, time }; the dive samples Between by path progress; phase moves to crate::timing; Heading sits beside passage's Side; departure folds into departing
- [x] #5 Existing move tests switch to the new constructors with their assertions unchanged; entrance_order.rs:115 asserts against visible_at(gone); new seam tests show a carry ignores rebase and answers no holder, no flown subjects and no tray, and an entrance answers no door
- [x] #6 Hashes of the move's answers over the corpus at progresses 0 to length and candidate 3's CPU frame hashes are identical before and after, and the site audit passes
- [x] #7 A short ADR records the rejected alternatives, and ADR 0071 is unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Baseline: frame harness (stage, CPU, Strips) and move-answer harness over a dark current-state corpus of 271 paintings. 2. Find and fix the nondeterministic interrupted-entrance frames, pinned by a seam test. 3. phase to timing, Heading beside Side, departure into departing. 4. One Between with carry and enter; Flight becomes Arriving; tests switch to the new constructors; new seam tests. 5. Prove hashes, SVG corpus, bench counts; ADR; gates; site audit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr

Nondeterminism: Between::new kept the last picture's pulses in a HashMap (traffic_in) and iterated it in stopping() to order the pulses of lines that stop. Leavers are sorted by place with a stable sort, and every stopping pulse group sits at the same place, so with two or more stopping lines their draw order followed the HashMap's random seed. An edit of an interrupted entrance redraws every line, so all its pulses stop: that is where TASK-653.18 saw it. Fix: the pulses are kept by line in a BTreeMap (c7dfcffd82). Pinned by between/interrupted.rs an_edit_of_an_interrupted_entrance_moves_the_same_way_every_time, which runs entrance, interrupting entrance and edit twice and compares the JSON bytes of the edit's frames; it failed 3 of 3 runs before the fix and passes after.

Baselines (artifacts/653-19, ignored; the 653-18 harness was gone, so new ones were written and kept uncommitted): a stage harness over 271 paintings of a dark current-state blocks corpus, scripted show, carry, carry interrupted by a carry, leaving beside, entrance over a ghost with the camera gliding (rebase), entrance interrupted by an entrance then edited, leaving into and an entrance on a passage, leaving out and stay, dive in, landing (bloom handed on), dive out and out of card: 12,060 CPU frame hashes (Strips) plus fill, stroke and layer counts. Six base runs: 6 frames (carry-10 and carry-120 of 3 paintings) differ between runs; after the fix, three runs are identical and differ from the base only in those 6 frames. Move answers: per painting a carry to the next, a carry to itself, a carry rebased, an entrance, an entrance with a handover, an entrance with a handover rebased; per progress -0.1, 0 to length by 0.1, length and length+0.5 the items, masks, definitions, seen_at, holder, focus, length and the ghost body: 1,626 hashes.

After: move answers 1,626 of 1,626 identical; CPU frames 12,060 of 12,060 identical to the fixed base; bench 4976 fills, 165 strokes, 67 layers before and after (and identical script totals); corpus SVG 0 of 271 differ.

Width: Picture motion 12 (Between, carry, enter, length, at, definitions, seen_at, focus, holder_at, rebase, departing, frame_of); INTERFACE_WIDE cleared; CODE_PASS_THROUGH now only on Between.holder_at (was masks_at, Entrance.holder_at, Entrance.rebase). archboard-paint and Painter stage widths unchanged (Picture motion is crate-private).

Shape details within the settled design: the carry's preparation moved to between/carry.rs and the entrance's to entrance::planned, so mod.rs holds the interface (the repository keeps Rust files under 600 lines). Arriving has one constructor new(between, ms) for both kinds, plus landed_from. The carry keeps (move_start, move_end) rather than the whole Transition (clippy large_enum_variant). holder_at answers the plan's holder for both kinds; a carry's plan holds none, which a seam test holds. Tests that asserted flown() now assert the ghost body enter returns; keeps_tray() became focus() == None.

Gates: build, cargo test --workspace, cargo clippy --workspace --all-targets, types, lint:all, format:check, format:core, test:modules (5346 pass), test:repository (182), test:system (227), browser owners that draw pictures (browser-drawn-pictures, drawn-glyphs, canonical-model-presentation, canonical-model-gestures, semantic-traffic, canonical-model-navigation: 73 pass, 0 fail), site paint and build (18 pages, links resolve). Site audit in agent-browser: the window's picture enters, Replay clears and enters again, the own-model section paints; no mock changed. App on examples/web-shop: first picture enters, opening Checkout API dives into its card and lands with traffic, switching to Queued fulfilment carries, light theme draws.

check code --fail-shallow-modules --base deepen/module-depth: no width or depth finding on Picture motion or archboard-paint. It exits 1 on other modules' findings, and on one new ANCHOR_MISMATCH: the relationship Painter stage -> Picture motion (ttPYQNXo) is anchored at flight.rs symbol Between, which flight.rs now only imports; the call is Between::carry in stage/mod.rs and Between::enter in stage/arrival.rs. The vault was left unchanged as instructed, so the anchor and Picture motion's description (which still speaks of a flight in flight.rs) must be updated with the proposal. model footprint --fail-outside exits 1: Picture motion is changed outside the draft sL6y1FLr, and ADR 0087 is unbound.

Outside the slice: none beyond the files the ticket names (between/, stage/, flight.rs, passage.rs, timing.rs) and ADR 0087. Private tests past the seam were kept.

Merged into deepen/module-depth. Footprint gate exits 0 (proposal commit a295c190f7); unbound: ADR 0087 (referenced from Picture motion) and this ticket.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Picture motion is one Between with carry and enter, sampled by progress: width 22 to 12, INTERFACE_WIDE cleared. at(p) answers the body and the moving masks, enter hands back the ghost's body without what flew over, focus says entrance or door, and a carry ignores rebase. The stage's Flight is the match-free Arriving, which owns the time. phase moved to timing, Heading beside Side, departure folded into departing. A nondeterminism (pulses of stopping lines ordered by HashMap seed) is fixed and pinned by a seam test. Proof: 1,626 move-answer hashes and 12,060 CPU frame hashes identical, bench counts and 271 SVGs unchanged, all lanes green, site audit passes. ADR 0087 records the rejected alternatives; ADR 0071 unchanged. Before merge: the vault's relationship anchor ttPYQNXo and the proposal sL6y1FLr need this slice (vault left unchanged as instructed).
<!-- SECTION:FINAL_SUMMARY:END -->

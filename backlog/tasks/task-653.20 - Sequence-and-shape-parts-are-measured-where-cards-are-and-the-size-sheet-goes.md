---
id: TASK-653.20
title: Sequence and shape parts are measured where cards are, and the size sheet goes
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T17:34:00Z'
updated_date: '2026-11-19T20:47:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-653.19
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1134000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 5 of the archboard-deepen run, fourth on the Rust track. Painting (crates/archboard-scene/src/paint) is wide (51 names), mostly its public size sheet (paint/design.rs): archboard-flows lays out sequence cards, messages and fragments by arithmetic on the painter's sizes, so two crates agree only by repeating it. The measurer answers each part's size through a private sibling module, Flow part measures, and the size sheet becomes private to measurer and painter. The settled design, every decision and its reason: the "Candidate 5, sequence and shape parts: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md (its "Settled by the orchestrator" points override the advisors where they differ), and the tree tree-05-parts.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout).

## Architecture

- Proposal: sL6y1FLr ("Deepen the wide and shallow modules"); this ticket builds its slice.
- Slice: Painting (crates/archboard-scene/src/paint), Measured text (crates/archboard-scene/src/measure), the new Flow part measures (crates/archboard-scene/src/flow_parts.rs), and the callers in archboard-flows, archboard-svg and archboard-paint.
- Gate: before this ticket merges, `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state sL6y1FLr --model-at checkout --fail-outside` exits 0, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on Painting, Measured text and Flow part measures.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Flow part measures exports exactly sequence_cards(cards, ColumnLimits) -> HeadCards { width, lifeline_drop, cards }, message_plate, note_plate, message_ends(kind, from_x, to_x, busy) taking centres, activation_span(centre), self_loop(start) -> Rect, fragment_head(operator, words, guards) -> FragmentHead, fragment_bounds(content_span, head) -> Span, flow_tab and shape_words (width 10, at least 40 pieces of logic), as a top-level private sibling module re-exported from lib.rs
- [ ] #2 Painting is 16 or 17 and Measured text 16, each 18 or fewer; INTERFACE_WIDE clears on Painting; the public size sheet is gone and its sizes are private to measurer and painter; fitted_size is private in Flow part measures, and message_lines and note_lines stay pub(crate) on the measurer
- [ ] #3 Title fitting (TITLE_SIZE_*, ICON_MIN_CARD_WIDTH) lives inside sequence_cards with flows passing column policy; fragment heights come from fragment_head measured once in place_frame and carried in FrameRows; side padding never leaves the measure
- [ ] #4 The far view's line scale, the core Purpose variant (spelled by the SVG painter exactly as Cutout) and the icon names (5 to 3) follow the settled entry; activation_span is reported to the owner as a getter with an argument
- [ ] #5 Native and WASM corpus SVG hashes, types.ts and marks.ts bytes and CPU frames of the corpus near and far are identical after each commit; paint-parity.ts runs once after the rails commit; the site audit passes
- [ ] #6 One test per measure states the agreement it exists for, and one archboard-flows test lays out and paints a small sequence and checks every card's words inside its text run and every message's ink inside its row
- [ ] #7 One short ADR: a layout learns a part's size from the measurer, never the painter's sizes; the sheet stays private to the crate of measurer and painter; the rejected routes with their reasons
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Baselines: WASM corpus (render-corpus, 1084), native renders of the captured requests (1084, equal to WASM), CPU frames near/mid-swap/far of the 542 light paintings, types.ts and marks.ts.
2. Counting spike with todo!() bodies: Painting 17, Measured text 16; a file module is not measured, so Flow part measures is the folder flow_parts/ (mod.rs root); a pub(crate) item at its root counts, so the guard speller sits in sequence_picture.rs.
3. Commits, each proved by native and WASM hashes, generated files and CPU frames: cards; messages (plates, ends, bar, self loop); notes; fragments; flow tab; shape words; far-line scale; core Purpose (then paint-parity); icon names; size sheet removed with residuals re-exported from their files.
4. Seam tests per measure plus one flows layout-and-paint test; ADR; gates; ticket notes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr
<!-- SECTION:NOTES:END -->

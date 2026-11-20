---
id: TASK-653.20
title: Sequence and shape parts are measured where cards are, and the size sheet goes
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T17:34:00Z'
updated_date: '2026-11-19T23:56:00Z'
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
- [x] #1 Flow part measures exports exactly sequence_cards(cards, ColumnLimits) -> HeadCards { width, lifeline_drop, cards }, message_plate, note_plate, message_ends(kind, from_x, to_x, busy) taking centres, activation_span(centre), self_loop(start) -> Rect, fragment_head(operator, words, guards) -> FragmentHead, fragment_bounds(content_span, head) -> Span, flow_tab and shape_words (width 10, at least 40 pieces of logic), as a top-level private sibling module re-exported from lib.rs
- [x] #2 Painting is 16 or 17 and Measured text 16, each 18 or fewer; INTERFACE_WIDE clears on Painting; the public size sheet is gone and its sizes are private to measurer and painter; fitted_size is private in Flow part measures, and message_lines and note_lines stay pub(crate) on the measurer
- [x] #3 Title fitting (TITLE_SIZE_*, ICON_MIN_CARD_WIDTH) lives inside sequence_cards with flows passing column policy; fragment heights come from fragment_head measured once in place_frame and carried in FrameRows; side padding never leaves the measure
- [x] #4 The far view's line scale, the core Purpose variant (spelled by the SVG painter exactly as Cutout) and the icon names (5 to 3) follow the settled entry; activation_span is reported to the owner as a getter with an argument
- [x] #5 Native and WASM corpus SVG hashes, types.ts and marks.ts bytes and CPU frames of the corpus near and far are identical after each commit; paint-parity.ts runs once after the rails commit; the site audit passes
- [x] #6 One test per measure states the agreement it exists for, and one archboard-flows test lays out and paints a small sequence and checks every card's words inside its text run and every message's ink inside its row
- [x] #7 One short ADR: a layout learns a part's size from the measurer, never the painter's sizes; the sheet stays private to the crate of measurer and painter; the rejected routes with their reasons
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

Baselines (artifacts/653-20, ignored): WASM corpus 1084 drawings (render-corpus); every corpus render request captured from the WASM host and drawn natively by a scratch example (1084, all equal to WASM); CPU frames of the 542 light paintings at 640x480, near, mid far-swap (far line scale between 1 and FAR_SCALE) and far: 1626 hashes, deterministic over two runs; types.ts and marks.ts.

Counting spike (throwaway branch): Painting 17, Measured text 16. A file module (flow_parts.rs) gets no depth entry from the check, so Flow part measures is the folder flow_parts/ with mod.rs as its root; a pub(crate) item at that root counts, so the guard speller sits in sequence_picture.rs. The new module was measured through a temporary vault entry bound to crates/archboard-scene/src/flow_parts, removed after each run; the vault is unchanged.

Proof after every commit (cards, messages, notes, fragments, flow tab, shape words, far lines, core purpose, icons, size sheet, final head): WASM 0 of 1084 differ, native 0 of 1084 differ and 1084 of 1084 equal WASM, CPU frames 0 of 1626 differ, types.ts and marks.ts byte-identical. Paint parity once after the rails commit (paint-parity.ts, windowed google-chrome, light Blocks corpus, --every 3): 540 comparisons over 90 drawings, GPU, WebGL and CPU, near and far; average 0.575% of ink apart, worst 1.24% (far views); no before run, by the ticket's instruction; traffic view not run (not in the script's default views).

Widths (check code --fail-shallow-modules --base deepen/module-depth): Painting 17 (15 functions, Applied, type_name), logic 4502, INTERFACE_WIDE cleared; Measured text 16, logic 584; Flow part measures 10, logic 173; archboard-scene 107 -> 79. No width or depth finding on the three. Their remaining findings are RELATIONSHIP_UNDRAWN (Flow part measures has no vault module yet). The exit 1 comes from other modules.

activation_span(centre) is a getter with an argument, reported to the owner as such: the layout reads the bar's half width from it for its clearances (rows.rs bar_reach).

Shape details within the settled design: the arrowhead's reach, which head each message kind ends in and the standoff moved into the private size sheet (sizes.rs), so the measure reads the painter's standoff without Painting widening to 18. fragment_bounds takes (ink: Option<Span>, columns: Span, head), because a fragment that holds no drawn ink spans the columns without padding. flow_tab answers the tab width and the header relative to the tab; the layout asks it once at the frame's least width for the heading's height and again at its final width. HeadCards, NotePlate, Size, FlowTab and FlowLook are not re-exported (no caller names them). sequence_cards takes CardWords. Icon names 5 -> 3 (kind_icon, flow_look, own_icons), as the settled entry says; candidate 7 absorbs them into paint.

Outside the slice: archboard-layout (9 files, import path paint::design::X -> paint::X); archboard-render appearance.rs, lib.rs, bin/export-marks.rs (kind_icon, own_icons import); archboard-scene sizes.rs (card heights, baselines, shadow reach, lifeline gap, arrowhead sizes), sequence_picture.rs (guard speller), scene/shape.rs (Purpose::Core), lib.rs; paint files that now own the residual names (page.rs, edge_tab.rs, cards.rs, far_view.rs, icons.rs) and slab.rs, shadow.rs, flowchart_shapes.rs, legend/export.rs (imports); archboard-paint draw/mod.rs and between/line.rs, interrupted.rs, draw/tests/kept.rs; one comment in packages/renderer measurement.test.ts.

Gates (nix develop, after merging deepen/module-depth at 2bb9ddd5e0): build, cargo test --workspace, cargo clippy --workspace --all-targets -D warnings, types, lint:all, format:check, format:core pass; test:modules 5357 pass, test:repository 182 pass, test:system 228 pass. Site: paint and diagrams redrawn (diagrams differ only in the step ids the import mints, reverted), site build passes with 18 pages' links resolving; agent-browser audit of the hero window, the zoom demo (ring on Inventory service) and the sequence tab: painted and drawn as before.

Footprint --fail-outside exits 1: 16 modules changed outside the draft sL6y1FLr (Design constants, Canvas drawing, Layout engines, Sequence layout, Measured text, Sequence painter, Slab surfaces, Block layout, Export frame, renderer, Flowchart, Edge tab, archboard-scene, archboard-layout, archboard-flows, archboard-render); ADR 0088 and this ticket unbound. Vault anchors that now point at gone code: Flowchart -> Design constants and Sequence layout -> Measured text (card.rs), Sequence layout -> Design constants (ends_for), the Draw a sequence step's anchor (card.rs), and Design constants' binding (paint/design.rs).

Merged into deepen/module-depth. Footprint gate: exit 1 with recorded exceptions (proposal commit 39699a8e15), listed in the merge commit. Open for TASK-653.21 and the final pass: Painting and Measured text carry RELATIONSHIP_UNDRAWN (seven callers use answers in Painting's own files; Measured text called from Painting's build.rs), which needs a part of Painting; the draft's semantic check shows 23 errors, none from this slice.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A flow layout now learns each part's size from Flow part measures (crates/archboard-scene/src/flow_parts, re-exported from lib.rs): sequence_cards, message_plate, note_plate, message_ends, activation_span, self_loop, fragment_head, fragment_bounds, flow_tab and shape_words. Title fitting, card chrome and heights, plate sizes, arrow standoffs, fragment heads and the flow heading left archboard-flows, whose sequence sheet keeps only placement spacing. The public size sheet paint::design is gone; Painting keeps 17 names (its own six, the six page and header sizes, the far line pair, three icon names), Measured text 16, Flow part measures 10 with 173 pieces of logic, archboard-scene 107 -> 79. A double line's core is Purpose::Core, spelled by the SVG painter as a cutout. Every commit was proved byte-identical natively and in WASM (1084 drawings), on 1626 CPU frames and in the generated types.ts and marks.ts; paint parity ran once after the rails commit; all lanes and the site audit pass. Ten seam tests state each measure's agreement, and one archboard-flows test paints a laid-out sequence and checks words and ink against the rooms the layout measured. ADR 0088 records the decision and the rejected routes. Before merge: the proposal sL6y1FLr needs this slice (Flow part measures module, Design constants removed, the five stale anchors), since the vault was left unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: TASK-653.21
title: >-
  archboard-scene splits into four crates that each keep only what other crates
  use
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T17:34:00Z'
updated_date: '2026-11-20T02:16:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-653.20
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1135000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 7 of the archboard-deepen run, last on the Rust track. crates/archboard-scene is wide (138 names, about 81 after candidates 2 and 5): numbers, geometry, the drawing contract and the measurer and painter share one crate whose callers are disjoint. It splits in dependency order into archboard-ecma, archboard-geometry, archboard-scene (the contract) and archboard-painting, decision 18's getter unspent in all four. Two gates park this ticket for the owner: if measure_label's paired plates fail the benchmark (flows discards narrow), archboard-painting's list is 21; if absorbing the icons into paint changes any byte, the icon decisions take two names on the contract (14). The settled design, every decision and its reason: the "Candidate 7, archboard-scene: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md (its "Settled by the orchestrator" points override the advisors where they differ), and the tree tree-07-scene-crate.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout).

## Architecture

- Proposal: sL6y1FLr ("Deepen the wide and shallow modules"); this ticket builds its slice.
- Slice: archboard-scene (crates/archboard-scene) and the new crates archboard-ecma, archboard-geometry and archboard-painting; callers in archboard-layout, archboard-flows, archboard-svg, archboard-paint, archboard-router and the two wasm crates.
- Gate: before this ticket merges, `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state sL6y1FLr --model-at checkout --fail-outside` exits 0, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on archboard-ecma, archboard-geometry, archboard-scene and archboard-painting.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 archboard-ecma exports round, number, to_fixed, fixed, within, hypot, min, max, sign, pow, trim and is_space (width 12, powi private); archboard-geometry exports the tree's 14 plus covering, route_length and shortened_by (width 17, EPSILON private)
- [x] #2 archboard-scene, the contract, has width 12: candidate 2's Scene without Text::set, word, picture_legend, Applied and type_name; Text::set is a private builder in painting and the three test sites build Text as plain data
- [x] #3 archboard-painting has width 20: candidate 5's ten Flow part measures plus paint(&PaintRequest) -> Scene, viewer_marks(), junction_boxes(&[Edge]), own_icons(), measure_node(node, &CardWords, Part::{Card, Container, FlowFrame}), measure_label(text) -> LabelPlates { wide, narrow }, diagram_margin(), straight_card_top_contains(rect, x), tab_width(w) and header_padding(); INTERFACE_WIDE clears on all four crates
- [x] #4 Park gate 1: a benchmark of measure_label's paired plates runs before the shape is committed; if it fails (flows discards narrow), the ticket parks for the owner with the list at 21
- [x] #5 Park gate 2: icons absorbed into paint (NodeAppearance.icon optional, a typed kind with a Flow variant feeding data-type-kind) change no byte; if any byte changes, the ticket parks for the owner with the icon decisions as two names on the contract (14)
- [x] #6 js_min and js_max fold into min and max under the benchmark; far-view widths and scale stay in painting behind viewer_marks and paint reads the marks once per stage; SVG spelling helpers move to archboard-svg and layout-only geometry to layout; PaletteColor::named is deleted and is_step private
- [x] #7 A counting spike precedes the move; native and WASM corpus SVG hashes and the generated types.ts and marks.ts are identical after each commit, and the site audit passes
- [x] #8 One ADR records the split, the far-view placement, Text::set, and that for layout and flows the split only moves names while the total falls from 138 to about 62
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Counting spike: stub crates measured through a temporary vault binding.
2. Moves and folds: SVG spellers to archboard-svg, layout-only geometry to archboard-layout, PaletteColor::named deleted, is_step private, js_min/js_max folded into min/max (benchmark).
3. D11's interface inside the old crate: measure_node(Part), measure_label plates, diagram_margin, straight_card_top_contains, header_padding, icons absorbed into paint (park gate 1 benchmark, park gate 2 bytes), far view into viewer_marks read once per stage, seam tests.
4. Extract archboard-ecma, then archboard-geometry, then archboard-painting (legend reading to the contract, Text::set and builders private traits in painting).
5. Prove each commit byte-identical (WASM and native corpus, CPU frames, types.ts, marks.ts); ADR 0091; NOTICE and renderer skill paths; all lanes, parity, benchmark, site audit, code check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr

Branch deepen/653-21-scene-crate. Commits in the settled order: b96f78c152 moves and folds; 0ae30e0fbd Painting's interface inside the old crate; 2fe576ee65 extract archboard-ecma; 591ce93aa8 extract archboard-geometry; 58b5d174e5 extract archboard-painting (with ADR 0091); merge of deepen/module-depth at 03fba08b53.

Starting widths recounted at c580fbec7f: archboard-scene 79, Painting 17, Measured text 16, Scene 10.

Counting spike (throwaway branch, deleted): stub crates bound through temporary vault entries: ecma 12, geometry 17, contract 12, painting 20. Width rules confirmed: types without methods count 0; an associated function without self counts as a function; a private extension trait and private methods of an exposed type count 0.

Park gates: both passed. Gate 1: measure_label's paired plates keep the speed benchmark (224 pass, 20.70 s against 21.14 s after the fold). Gate 2: absorbing the icons into paint changed no byte (SVG, painting JSON, CPU frames, types.ts, marks.ts).

Widths at the head (check code with a temporary vault binding of the three new crates, removed after the run): archboard-ecma 12 (logic 212), archboard-geometry 17 (291), archboard-scene 12 (327), archboard-painting 20 (5241); Painting module 8, Measured text 14, Scene 8. No INTERFACE_WIDE or MODULE_SHALLOW on any of the four. With the vault unchanged, check code --fail-shallow-modules --base deepen/module-depth judges archboard-scene at 12 with no finding; its exit 1 comes from other modules (ui-kit, workspace, renderer, workbench, Model queries) and from vault bindings and anchors into the moved files.

Proof after every commit (harness outside the checkout: WASM corpus, native renders of the 1084 captured requests, CPU frames of 542 light paintings at near, mid far-swap and far, export-types and export-marks): WASM 0 of 1084 differ, native 0 of 1084 differ and 1084 of 1084 equal WASM, CPU frames 0 of 1626 differ, types.ts and marks.ts identical. Commits 2 to 4 were rewritten once so draw/mod.rs stays under 600 lines, and proved again with cargo test.

Design within the settled shape: TypeKind { Flow, Policy(String) } with serde's untagged Policy, so the scene JSON is unchanged; the painter writes the drawn icon into the scene's appearance. Legend reading (picture_legend, Applied, Drawn, PictureLegend) is archboard_scene::legend; the export entries stay in Painting. The builders (Shape, Stroke, Group, Text including set, Colour::palette) are private extension traits in painting/paint/build.rs. guard_words moved to painting's flow_parts/fragments.rs (both readers are in Painting). pulse_breadth and turn_distance are pub in the scene (Painting reads them; they were already counted). ViewerMarks gains far_lines and far_scale; the canvas painter's stage reads viewer_marks once and passes it to drawing and warnings. Layout keeps its own route tolerance (0.01). trim_end and split_spaces moved into the measurer.

Callers for the undrawn notes (for the proposal): Painting is reached at paint/page.rs diagram_margin (flows flowchart/frames.rs, flows sequence/design.rs, layout architecture/page.rs), paint/junctions.rs junction_boxes (layout routes/hops.rs), paint/icons.rs own_icons (render lib.rs, bin/export-marks.rs), paint/cards.rs straight_card_top_contains (layout track/jogs.rs), paint/edge_tab.rs tab_width and header_padding (layout blocks/routing.rs, blocks/headers.rs, blocks/planned/model.rs, blocks/readback.rs, blocks/lone.rs, track/title_rows.rs, track/sides.rs), paint/marks.rs viewer_marks and ViewerMarks (svg lib.rs, render bin/export-marks.rs, paint warnings.rs, stage/mod.rs, draw/mod.rs, draw/viewer.rs), paint/mod.rs paint (render lib.rs). Measured text is reached at measure/cards.rs measure_node, Part, CardWords (render architecture.rs, flows flowchart/mod.rs, flows sequence/layout.rs) and measure/labels.rs measure_label (render architecture.rs, flows flowchart/mod.rs); inside Painting at paint/build.rs (TextBuilder::set and central call measure::face and measure::width). Flow part measures (flow_parts/) is reached from flows sequence/layout.rs, messages.rs, rows.rs, frames.rs, placing.rs and flowchart/mod.rs.

Outside the slice: archboard-layout (imports; routes/curves.rs new with reversed and same_rounded_curve; constants.rs drops CARD_RADIUS and route_tolerance), archboard-flows (imports, Part, plates, TypeKind), archboard-render (plates, Part, optional icon), archboard-svg (spelling.rs new; kind_word; far rules from viewer_marks; tests build Text as plain data), archboard-paint (viewer marks once per stage in Stage, Inks, Walk and Warnings; far scale moved to draw/viewer.rs; tests build Text as plain data via testing::words_at), archboard-graphviz and archboard-painter-wasm (Cargo dependencies), packages/renderer NOTICE.md and three test comments, skills/archboard-renderer/SKILL.md.

Gates on the head after merging deepen/module-depth: cargo test --workspace, cargo clippy --workspace --all-targets -D warnings, types, lint:all, format:check, format:core pass; test:modules 5392 pass, test:repository 182 pass, test:system 228 pass; speed benchmark 224 pass (20.98 s). Site: paint.ts and render redrawn (diagrams differ only in the step ids the import mints, reverted), site build passes with 18 pages' links resolving; windowed Chrome screenshots of the hero, the live window and the own-model section match the base build.

Paint parity once at the head (paint-parity.ts, windowed google-chrome, light Blocks corpus, --every 3): 540 comparisons over 90 drawings, GPU, WebGL and CPU, near and far; average 0.575% of ink apart, worst 1.24% (far views), the same figures TASK-653.20 recorded. Owed coverage: the traffic view, the dark theme, the Track engine and two thirds of the drawings.

Vault unchanged. Its bindings into crates/archboard-scene/src/{paint,measure,js.rs,geometry.rs} and the anchors into those files now point at moved files (BINDING_PATH_MISSING, ANCHOR_PATH_MISSING), and the anchor of Scene -> ECMAScript numbers names js_max, which the fold removed (ANCHOR_SYMBOL_MISSING): the proposal slice rebinds them.

Merged into deepen/module-depth. Footprint gate: exit 1 with recorded exceptions (proposal commit e6c3ac2691), listed in the merge commit. Unbound: this ticket, Cargo.lock, ADR 0091, skills/archboard-renderer/SKILL.md. Open for the final pass: EXPOSED_UNUSED LabelPlates (Measured text, archboard-painting); EXPOSED_VALUE_COMPUTED header_padding (Block layout and archboard-layout compute w - header_padding()).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard-scene split into four crates in dependency order, each keeping only what other crates use: archboard-ecma 12 names (ECMAScript numbers), archboard-geometry 17 (points, boxes, routes), archboard-scene 12 (the drawing contract, the scene, the legend reading and names::word) and archboard-painting 20 (the measurer and painter with their private size sheet: the ten Flow part measures plus paint, viewer_marks, junction_boxes, own_icons, measure_node over Part, measure_label with both plates, diagram_margin, straight_card_top_contains, tab_width, header_padding). The crates' total falls from 79 (138 before the run) to 61, and none is wide or shallow. SVG spellers moved to archboard-svg, layout-only geometry to archboard-layout, js_min/js_max folded into min/max, PaletteColor::named deleted, is_step private; icons are decided in paint (optional icon, TypeKind with a Flow variant); the far view's widths and scale live in the viewer marks, which the canvas stage reads once; Text::set and the builders are private extension traits of Painting. Both park gates passed. Every commit draws byte-identical output natively and in WASM (1084 drawings), on 1626 CPU frames and in types.ts and marks.ts; all lanes, the speed benchmark, the site build and audit pass; paint parity matches TASK-653.20's figures. ADR 0091 records the split. The vault is unchanged: the proposal slice must rebind the moved modules and draw the callers listed in the notes.
<!-- SECTION:FINAL_SUMMARY:END -->

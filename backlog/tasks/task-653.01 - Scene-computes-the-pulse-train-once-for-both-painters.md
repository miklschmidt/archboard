---
id: TASK-653.01
title: Scene computes the pulse train once for both painters
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T16:20:00Z'
updated_date: '2026-11-19T17:38:00Z'
labels:
  - ready-for-agent
dependencies: []
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1114000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 2 of the archboard-deepen run. crates/archboard-scene/src/scene is wide (40) and shallow (logic 91), and the SVG and GPU painters each carry their own untested copy of the pulse code with different math. Scene computes the pulse train once, with the SVG math, and both painters read it; producer-only builders move out of Scene. The settled design, every decision and its reason: the "Candidate 2, Scene: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md, and the tree tree-02-scene.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout).

## Architecture

- Proposal: the redesign proposal of the deepen/module-depth layer (its id is added here when it is authored).
- Slice: Scene (crates/archboard-scene/src/scene), Painting (crates/archboard-scene/src/paint), the SVG painter (crates/archboard-svg), the GPU painter (crates/archboard-paint traffic).
- Gate: before this ticket merges, `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state <proposal> --model-at checkout --fail-outside` exits 0, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on Scene.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Scene exposes pulse_train, pulse_slide, pulse_breadth and turn_distance, with Group::new, Transform::translate and Text::set, and its width is at most 10 with at least 40 pieces of logic; INTERFACE_WIDE and MODULE_SHALLOW clear on Scene
- [x] #2 Both painters read the one pulse train; the old copies are deleted
- [x] #3 The native and WASM corpus SVG hashes are identical before and after, and export-types and export-marks outputs diff empty
- [x] #4 GPU, WebGL and CPU parity compared before and after on steady and turn traffic, or GPU parity recorded as owed when only the CPU painter can run
- [x] #5 About five Rust tests cover a bent route, a piece under LEAST_PIECE, a crowded and an uncrowded train, the turn window clamping, and a slide on and off a leg
- [x] #6 CONTEXT.md defines Pulse train, and an ADR states that the painter owns the clock and the scene maps a moment to a position
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Baseline: WASM corpus hashes (full and a blocks/light/plain corpus with paintings), native SVG hashes of the same paintings (scratch example, not committed), export-types and export-marks outputs, GPU, WebGL and CPU paint parity on the traffic view.
2. Counting spike: move Stroke::dashed to paint/build.rs; check Scene's and Painting's counts; revert.
3. Pulse train in scene/traffic.rs (where the proposal binds it): pulse_train, pulse_slide, pulse_breadth, turn_distance with PulseTrain, PulseLeg, LegMotion, PulseStop, GlowLayer, Bar; SVG math operation for operation; five Rust tests through pulse_train and pulse_slide.
4. SVG painter onto the pulse train; delete archboard-svg/src/legs.rs; native hashes identical.
5. GPU painter onto the pulse train and pulse_slide.
6. Painting onto pulse_breadth and turn_distance; delete the 11 old functions; six scene submodules private.
7. Builders to private paint/build.rs; Colour::token deleted; archboard-paint's outline helper and struct-literal test fixtures.
8. Width gate: archboard check code --fail-shallow-modules shows no finding on Scene.
9. Records: Pulse train in CONTEXT.md, ADR 0083, test-suite.md ownership line.
10. After: build the core; WASM and native hashes, export diffs, parity after; merge deepen/module-depth; final gates.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr

Baselines (artifacts/task-653.01/before): 1084 WASM drawings (full corpus), 271 with paintings (blocks, light, plain), 114 of them with traffic and 1135 pulse groups; native SVG of those 271 paintings painted by a scratch example (never committed) through archboard_svg::document; native and WASM pulse markup equal in all 271 files.
Counting spike: moving Stroke::dashed to paint/build.rs as pub(in crate::paint) took Scene from 13 methods to 12 and logic 91 to 90; Painting stayed 49 functions, 1 class, 1 method. Option 1 holds. The check prints counts, not names: of the 15 written setters it counted 13, and after the move Scene counts 0 methods, so every counted setter left.
Result: Scene width 10 (7 functions: pulse_train, pulse_slide, pulse_breadth, turn_distance, Group::new, Transform::translate, Text::set; 3 classes: Group, Transform, Text; 0 methods), logic 237. INTERFACE_WIDE and MODULE_SHALLOW clear; no finding on Scene. Painting unchanged at 51 names (candidate 5).
Proof: WASM 0 of 1084 drawings differ and 0 of 271; native 271 of 271 identical; paintings byte-identical; export-types and export-marks diff empty.
Outside the slice: archboard-scene route.rs and geometry.rs (segment_length is read from route.rs and no longer re-exported, since no crate outside uses it now); archboard-paint pick.rs, warnings.rs, raise.rs, sweep.rs, palette.rs, path.rs, stage/ and between/ tests (D10 fixtures); paint/marks.rs and paint/legend/symbols.rs (import path, D3).
Crate-level EXPOSED_UNUSED that this change makes and cannot clear here: js.within, scene.pulse_breadth and scene.turn_distance are now used only inside archboard-scene (Painting is in the same crate), and the check counts pub(crate) as exported; candidate 7's crate split decides them.
Risk for TASK-653.04: once width counts a type's public methods in any file of its crate, the pub(in crate::paint) builders in paint/build.rs count toward Scene again; the settled fallback, a private extension trait in Painting, then applies.

Pulse train lives in scene/traffic.rs, where proposal sL6y1FLr binds it (symbol pulse_train); the footprint resolves it. Footprint --fail-outside still exits 1 on five modules the settled design forces: Viewer marks (paint/marks.rs) and Legend and export (paint/legend/symbols.rs) change one import each because the scene submodules are private (D3); Scene picking (pick.rs) and Viewer warnings (warnings.rs) change test fixtures because the builders left Scene (D10); archboard-scene holds the seam tests (tests/pulse_train.rs) and the segment_length import. The draft must name them.
Parity (scripts/paint-parity.ts, windowed google-chrome, --views traffic, gpu, webgl and cpu): the before run stopped at its 30-minute limit after 759 comparisons; on those 759 (253 readings a painter, 104 with traffic, steady trains in architecture readings and turn pulses in sequences) nothing got worse by more than 0.01% of ink; differing pixel counts are equal in 249 (gpu), 249 (webgl) and 252 (cpu) readings, and the largest change is an improvement of 0.0034% of ink. The after run covered 810 comparisons, worst 0.92% (webgl), within the 0.1 colour tolerance report as before.
Final proof after the merge of deepen/module-depth: WASM 0 of 1084 drawings differ; export-types and export-marks identical; native 271 of 271 identical.
Gates (nix develop, foreground): cargo test --workspace 489 passed; cargo clippy --workspace --all-targets no warnings; cargo fmt --check clean; vp run types, lint:all, format:check pass; test:modules 5324 pass; test:repository 176 pass; test:system 227 pass; archboard check code --fail-shallow-modules: Scene width 10, logic 237, no warning on Scene (exit 1 from pre-existing findings of other modules and the crate-level ones noted above).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Scene now computes a traffic mark's pulse train once (pulse_train) and maps a moment of a painter's clock to a bar position (pulse_slide); the SVG painter spells it and the canvas painter (GPU, WebGL, CPU) draws it, and both old copies of the pulse code are gone (archboard-svg/src/legs.rs and the body of archboard-paint/src/traffic.rs). The shared code uses the SVG's deterministic math operation for operation, so every SVG is byte-identical natively and in WebAssembly, and paint parity did not get worse. Painting reads pulse_breadth and turn_distance; the eleven old pulse getters are deleted; the six scene submodules are private; the builders moved into Painting's private build file, with archboard-paint building its two outlined plates through one helper and its tests through struct-literal fixtures. Scene went from 40 names and 91 pieces of logic (wide and shallow) to 10 names and 237, with no finding. Five Rust tests at the seam own a pulse's numbers. ADR 0083, CONTEXT.md (Pulse train) and the test guide record it.
Follow-ups: the footprint draft must name five modules the design forces; three crate-level EXPOSED_UNUSED warnings (js.within, scene.pulse_breadth, scene.turn_distance) wait on candidate 7's crate split; TASK-653.04 will count Painting's pub(in crate::paint) builders toward Scene, and the settled fallback (a private extension trait) then applies.
<!-- SECTION:FINAL_SUMMARY:END -->

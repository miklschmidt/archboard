---
id: TASK-653.01
title: Scene computes the pulse train once for both painters
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-19T16:20:00Z'
updated_date: '2026-11-19T16:23:00Z'
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
- [ ] #1 Scene exposes pulse_train, pulse_slide, pulse_breadth and turn_distance, with Group::new, Transform::translate and Text::set, and its width is at most 10 with at least 40 pieces of logic; INTERFACE_WIDE and MODULE_SHALLOW clear on Scene
- [ ] #2 Both painters read the one pulse train; the old copies are deleted
- [ ] #3 The native and WASM corpus SVG hashes are identical before and after, and export-types and export-marks outputs diff empty
- [ ] #4 GPU, WebGL and CPU parity compared before and after on steady and turn traffic, or GPU parity recorded as owed when only the CPU painter can run
- [ ] #5 About five Rust tests cover a bent route, a piece under LEAST_PIECE, a crowded and an uncrowded train, the turn window clamping, and a slide on and off a leg
- [ ] #6 CONTEXT.md defines Pulse train, and an ADR states that the painter owns the clock and the scene maps a moment to a position
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Baseline: WASM corpus hashes (render-corpus render), native SVG hashes of the same paintings (scratch example, not committed), export-types and export-marks outputs, CPU (and GPU/WebGL when a windowed browser runs) paint parity on traffic.
2. Counting spike on a scratch branch: move one counted setter to paint/build.rs; check Scene's and Painting's counts; list the 13 counted methods.
3. Shared implementation in scene/traffic (private submodules): pulse_train, pulse_slide, pulse_breadth, turn_distance with PulseTrain, PulseLeg, LegMotion, PulseStop, GlowLayer, Bar; SVG math operation for operation; ~5 Rust tests through pulse_train and pulse_slide.
4. SVG painter onto the pulse train; delete archboard-svg/src/legs.rs; native and WASM hashes identical.
5. GPU painter onto the pulse train and pulse_slide; parity compared.
6. Painting onto pulse_breadth and turn_distance; delete the 11 old functions; six scene submodules private.
7. Builders to private paint/build.rs; Colour::token deleted; archboard-paint's outlined-rectangle helper and fixture helpers.
8. Width gate: archboard check code --fail-shallow-modules shows no finding on Scene.
9. Records: Pulse train in CONTEXT.md, ADR (painter owns the clock, scene maps a moment to a position), test-suite.md ownership line.
<!-- SECTION:PLAN:END -->

---
id: TASK-653.01
title: Scene computes the pulse train once for both painters
status: To Do
assignee: []
created_date: '2026-11-19T16:20:00Z'
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

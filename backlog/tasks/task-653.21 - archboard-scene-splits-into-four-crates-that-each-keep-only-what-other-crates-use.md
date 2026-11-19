---
id: TASK-653.21
title: >-
  archboard-scene splits into four crates that each keep only what other crates
  use
status: To Do
assignee: []
created_date: '2026-11-19T17:34:00Z'
updated_date: '2026-11-19T17:34:00Z'
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
- [ ] #1 archboard-ecma exports round, number, to_fixed, fixed, within, hypot, min, max, sign, pow, trim and is_space (width 12, powi private); archboard-geometry exports the tree's 14 plus covering, route_length and shortened_by (width 17, EPSILON private)
- [ ] #2 archboard-scene, the contract, has width 12: candidate 2's Scene without Text::set, word, picture_legend, Applied and type_name; Text::set is a private builder in painting and the three test sites build Text as plain data
- [ ] #3 archboard-painting has width 20: candidate 5's ten Flow part measures plus paint(&PaintRequest) -> Scene, viewer_marks(), junction_boxes(&[Edge]), own_icons(), measure_node(node, &CardWords, Part::{Card, Container, FlowFrame}), measure_label(text) -> LabelPlates { wide, narrow }, diagram_margin(), straight_card_top_contains(rect, x), tab_width(w) and header_padding(); INTERFACE_WIDE clears on all four crates
- [ ] #4 Park gate 1: a benchmark of measure_label's paired plates runs before the shape is committed; if it fails (flows discards narrow), the ticket parks for the owner with the list at 21
- [ ] #5 Park gate 2: icons absorbed into paint (NodeAppearance.icon optional, a typed kind with a Flow variant feeding data-type-kind) change no byte; if any byte changes, the ticket parks for the owner with the icon decisions as two names on the contract (14)
- [ ] #6 js_min and js_max fold into min and max under the benchmark; far-view widths and scale stay in painting behind viewer_marks and paint reads the marks once per stage; SVG spelling helpers move to archboard-svg and layout-only geometry to layout; PaletteColor::named is deleted and is_step private
- [ ] #7 A counting spike precedes the move; native and WASM corpus SVG hashes and the generated types.ts and marks.ts are identical after each commit, and the site audit passes
- [ ] #8 One ADR records the split, the far-view placement, Text::set, and that for layout and flows the split only moves names while the total falls from 138 to about 62
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr
<!-- SECTION:NOTES:END -->

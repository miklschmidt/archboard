---
id: TASK-624
title: >-
  A Blocks reading with every door open draws instead of failing for a planned
  channel
status: Done
assignee:
  - '@claude'
created_date: '2026-11-10T15:20:00Z'
updated_date: '2026-11-21T05:37:00Z'
labels:
  - bug
  - renderer
dependencies: []
ordinal: 1069000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Opening every door of the 'Reads and server health' scope (vKEsyHFk/HBlhIeSD#ETrslazw) with no kinds hidden fails to draw. The renderer throws 'No clear planned channel for vKEsyHFk#aJzBoBHj', so the reader sees no picture. Main at 36865dc622 fails the same way, and so does the head of PR 73 before its stacks change. Found while building a corpus of readings with several frames open for TASK-559.09. After PR 73 that reading draws, because its stacks give it another placement, but the fallback that throws is still there for any other reading that reaches it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Blocks reading whose dense placements and fallbacks find no clear planned channel for a line still returns a drawing
- [x] #2 A focused test reproduces the failure with a graph that reaches that fallback
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the planned-channel refusal on the pre-deepening vault (Packages focus in proposal sL6y1FLr) and capture the layout graph.
2. Find the refused term natively and decide the fallback with an advisor.
3. When every dense placement and legacy candidate refuses, answer the legacy Blocks placement unplanned; keep Graphviz failures as errors.
4. Focused test through lay_out_picture; corpus byte-identical; amend ADR 0063.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: a crowded card (workbench, 33 line ends in a 171-line reading) leaves blocked lines no candidate that port spacing (Fit::append peers, planned/selection.rs) and Junctions::clear accept. Extending WIDER_ROOMS to 2400 still drew nothing, so room is not the blocked term. solved() in blocks/place.rs then returned Err('No clear planned channel ...').
Fix: hybrid/solved answer Option of a planned drawing; lay_out_picture takes legacy::place(Nesting::Blocks) unplanned when none plans. Graphviz failures still error. Refused lost its unread message field. ADR 0063 amended 2026-11-21.
Evidence: reproduction now draws (10240x8894 page, 171 lines, 0 segments through a non-endpoint card); render corpus 0 of 1116 drawings differ; TASK-624's own scope with all 10 doors open draws. Lanes: build, types, lint:all, format:check, format:core, test:core, test:modules (5396 pass), test:system (228 pass), browser lane (73 pass) all green.
Follow-up candidate (not filed): make card wall capacity negotiable (port_spacing APART against fixed walls) so such readings plan; the fallback page is large and sparse.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A Blocks reading whose placements all refuse now draws by its legacy placement with its own routes, unplanned, instead of throwing 'No clear planned channel'. Focused tests in crates/archboard-layout/tests/planned.rs reach the fallback with a card too small for its eight lines and check that a Graphviz failure still fails. Corpus byte-identical. ADR 0063 amended.
<!-- SECTION:FINAL_SUMMARY:END -->

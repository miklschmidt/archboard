---
id: TASK-195
title: Implement the measured compound renderer in an isolated worktree
status: Done
assignee:
  - '@codex'
created_date: '2026-09-13 01:30'
updated_date: '2026-09-13 02:09'
labels: []
dependencies: []
ordinal: 354000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The approved Readable layout proposal replaces fixed card seats, late text fitting and separate corridor routing with measured text, one compound layout owner and a painter consuming final geometry. Implement against the copied current working state, keep the original renderer available, and compare real browser output on the same dogfood boards to polish the result.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A separate worktree implements measurement before compound placement and routing, with SVG and atlas derived from the same final drawing.
- [x] #2 Card titles and responsibilities wrap at readable sizes using measured text; labels and cards retain ample clearance.
- [x] #3 Compound architecture diagrams preserve containment and deterministic readable routes, including skipping and returning connections.
- [x] #4 Old and new renderer servers run independently on the same authored examples and are opened for side-by-side browser comparison.
- [x] #5 Focused behavior checks, full repository checks, and visual QA with polishing passes succeed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create an isolated worktree carrying the current working state and preserve the original live server. 2. Integrate pinned Pretext through the existing bundled-font measurement engine and ELK compound layout, exposing a complete measured/placed drawing. 3. Replace architecture grid/corridor passes with one layout owner and make SVG painting consume supplied geometry and lines; propagate async rendering at callers. 4. Start an independent server against equivalent authored boards and compare real browser output, iterating on text, spacing, route/label clarity and atlas correctness. 5. Delete superseded architecture paths, run focused behavior checks and full gate, and leave both browser versions available.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation now uses Pretext 0.0.9 for measured wrapped lines and ELK 0.12.0 for one compound placement/routing result consumed by a pure SVG painter and the same atlas. Removed the old grid, corridor, congestion and label-repair owners. Pinned patches provide Pretext font measurement injection and fix an ELK declaration; neither adds a DOM shim or weakens TypeScript. Both copies run independently on 3000/3001 with cloned vault inputs. Compared every board/variant/view through live APIs: 35 drawings and 3 expected empty results, identical subject identities. Browser comparison on 3002 supports the same board, variant, view and theme with independent pan/zoom. Focused regressions are driving the final route and spacing polish.

Final routing polish uses inline engine labels, ordered ports and explicit side ports at hierarchy crossings. The renderer suite passes 116 tests. Browser QA covered system and contained workbench diagrams, proposal integration, light/dark themes, complete text inside browser-drawn card bounds, and card/relationship inspection. Final live API comparison again passed all 35 drawings plus 3 expected empty views with identical subject identities. Sequence SVG and atlas match the original byte-for-byte. A final frontend reload check exposed a selected-view initialization race; fixing it so comparison links retain their requested view before final acceptance.

Final QA fixes: pending drawings no longer overwrite the resolved pane address, verified in the real frontend by opening and refreshing Renderer integration with its variant/view intact. Unlabelled return warnings now anchor to the route instead of the curve bounds; its regression reproduced 24px detachment before the fix. Container headings preserve authored case; browser inspection coverage now reads those headings. Simplification removed roughly 3,500 lines from the private renderer implementation compared with the original checkout; no second placement or label-repair pass remains.

Final bun run check completed with exit 0: lint, formatting, both TypeScript projects, frontend build, 2802 module tests, 154 system tests, 8 repository tests, and all serial browser owners passed. Original server remains on 3000; implemented renderer on 3001; detached side-by-side comparison on 3002. Browser tabs retained for review.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented the approved measured compound pipeline in codex/readable-renderer with Pretext, ELK, and one final drawing shared by SVG and atlas. Deleted the old grid/corridor/label repair paths, polished wrapping, whitespace, route ordering, hierarchy crossings and warning placement, and fixed proposal-view restoration during loading. Verified all authored board/view combinations against the untouched original renderer, completed real-browser visual and interaction QA, and passed the complete bun run check gate.
<!-- SECTION:FINAL_SUMMARY:END -->

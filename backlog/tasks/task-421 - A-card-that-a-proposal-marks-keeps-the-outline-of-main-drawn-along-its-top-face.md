---
id: TASK-421
title: >-
  A card that a proposal marks keeps the outline of main, drawn along its top
  face
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 12:48'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0025-containment-and-type-own-distinct-visual-channels.md
ordinal: 708000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On main a part that a proposal added, changed or removed takes over its outline: solid green, dashed orange or dashed red, heavier than a normal outline (standingOutline in lib/svg/standing.ts). The slab work replaced that with a wash, a hatch and a pin. The owner says the change and standing marks on cards have regressed: the card should keep the border of main, and the border should run along the top surface, on the inside of the card.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A card, a participant, a container and a relationship label that a proposal marked draw the outline of main (the same color, width and dash as on main) along the edge of their top face, on the inside of the part, flush with the face, with no gap and not inset as a second box
- [x] #2 The front edge keeps the group color, the pin stays, a removed part stays a ghost, and the marks read at a glance in both themes, near and far, with the selection ring and the group look
- [x] #3 The tests that held the wash and the ring are updated, ADR 0025, ADR 0044 and DESIGN.md say how a mark is drawn, and bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board is affected by this appearance-only change. Complete the existing implementation notes, run the relevant renderer or viewer owners and bun run check, and reconcile earlier appearance choices with the later accepted tasks.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commit d290d63f. The outline of main is back as the mark: 1.8 units (OUTLINE_WIDTH), in the standing's ink, solid for added, dashed 7 on 3.5 off for changed and removed (OUTLINE_DASH), as standingOutline on main. standingBorder (slab.ts) draws it along the edge of the top face (the face above the front edge), inside it: the stroke's outer edge on the face's edge, its corners the face's radius minus half the stroke. Cards and participants (slab), relationship labels (slab, label edge neutral again), containers: along the edge of the tray's box, round the walls, which are the container's own outline (the nameplate keeps its kind). A removed part: the ghost face inside the dashed red border round its footprint (same width and dash; was 1.5 at 6 4). The selection ring stays 3 units outside, so a selected marked part shows its border and one ring outside it; a removed part's ring covers its footprint border. Removed: the face wash (WASH), the hatch (HATCH, the pattern, hatched), the tray floor wash and plate hatch, the label's standing edge (LABEL_STANDING_EDGE, inkedEdge): a grouped marked card keeps its group tint. Test: grouping.test.ts now holds that a changed card keeps its face and edge colors and draws one dashed border in the standing's ink flush with its top face. ADR 0025, ADR 0044 (rules 2, 10, 11 and the rejected ring) and DESIGN.md updated. Renders: scratchpad proposals/slabs-s/marks-ab (fixture and sequence before/after, near and far; queued board before/after; selected changed card crops).

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Proposal subjects retain the main outline along the top face. Pins, ghosts, group colors, and selection remain readable. Standing-mark owners pass. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

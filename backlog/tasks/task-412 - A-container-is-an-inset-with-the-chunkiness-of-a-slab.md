---
id: TASK-412
title: A container is an inset with the chunkiness of a slab
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 10:23'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0044-cards-containers-and-groups-are-drawn-as-slabs.md
ordinal: 699000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner wants containers drawn as an inset, like the Pockets prototype (branch surface-depth/pockets, lib/svg/surface.ts), but with the same chunkiness as the slabs: thick walls that show their depth. Today a container is a raised plinth with a front edge (ADR 0044, rule 3). The Pockets prototype had walls that were too faint to see in the light theme, and its fix round (commit 945948919 on that branch) made them visible with a deeper top and left wall, a lit lip with a crease beside it and a warmer floor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A container is drawn as a recessed tray in the light and the dark theme, with walls that are as thick and as readable as the front edge of a slab, a floor, and a lit lip, and nothing floats
- [x] #2 Nested containers sink below their parents, and grouped cards and lines remain readable on the neutral floor.
- [x] #3 The header is the group-tinted slab of TASK-423, and container lines leave its front edge. Subsequent inset changes follow TASK-431.
- [x] #4 The comparison marks, the selection ring, the far view and the sequence frame work with the inset, in both themes
- [x] #5 The change is its own commits so that the owner can revert it alone, and ADR 0044 and DESIGN.md say how a container is drawn
- [x] #6 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read how the plinth is built (lib/svg/slab.ts, measured-cards.ts, dataflow.ts frame) and how the Pockets branch built its pocket (git show surface-depth/pockets:src/transformers/semantic-renderer/lib/svg/surface.ts). 2. Design the chunky inset: thick top and left walls, a floor, a lit lip on the bottom and right walls, in stacked shapes with no filter. 3. Keep the header as a plate that sits in the pocket and keeps the kind color and the line origin. 4. Render every review board in both themes before and after, and ask the owner to judge. 5. Update tests, ADR 0044 rule 3, DESIGN.md and the legend if it keys containers.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Body tint (commit 5ad45855): a container's body takes its kind's colour again, a calm tint so the header no longer stands out of it. Light body 0.045 of the kind, dark 0.12 from a deepened ink. The nameplate came down a step to stay related to the body: light 0.08 (was 0.11), dark 0.15 (was 0.18). A proposal's standing wash replaces the kind tint on the body, and the kind stays on the nameplate and its edge. Nested containers keep their kind tint one step deeper. Group cards inside a tinted container stay distinguishable, and the secondary words on the body clear 4.5:1. The sequence frame stays neutral. Renders: scratchpad proposals/slabs-s/k1.

Inset (commit ea2d284a): a container is a tray cut into the page or into its parent's floor. Construction: top and left walls 7 units, shaded from the floor toward --slab-deep (light 0.8, dark 0.55) and tinted 0.15 by the kind; bottom and right a 2-unit lit lip (--tray-lip) with a 1-unit crease outside it in the shadow tone, so it reads on any ground. The floor is a step below the page (--tray-floor: light 0.955, dark 0.17) with the kind tint (0.045 / 0.12). Each nested tray sinks 0.4 of the way toward --tray-sink, at most 0.8, so it is cut a step deeper. The walls throw a short three-band shadow on the floor; a tray casts no shadow of its own. Header: a raised plate (--tray-plate, kind 0.08 / 0.15) seated against the top wall with a 3-unit kind front edge at the header's foot, where the container's lines still leave. Tried the other option, the top wall band carrying the title: it made the header the darkest, heaviest part of every container in both themes, put the summary on a shaded face at about 4.6:1, made the top wall ten times thicker than the left so the tray stopped reading, and lost the front edge the lines leave from. Standing: the wash replaces the kind on the floor; the plate and walls keep the kind; a changed plate is hatched at half strength; a removed container leaves the ghost. The flow frame is the same tray, neutral. Tokens renamed --plinth-* to --tray-floor, --tray-sink, --tray-plate, --tray-lip; plinth look, nameplate and plinth shadow removed. Contrast: secondary words on a plate 5.33 light / 5.53 dark worst, on a floor 4.99 / 7.11, neutral line on any nested floor 3.02 / 4.45. Renders: scratchpad proposals/slabs-s/i5 and the before/after set in proposals/slabs-s/tray-ab. Left for the docs agent: DESIGN.md, docs/adr/0044 and 0025, 0038, docs/agents/frontend.md and the README SVGs still say plinth.

Acceptance reconciliation (2026-10-07): later owner choices replace the intermediate appearance and WCAG ratios. The criteria now name the final behavior. Historical criteria:
Original criterion 2: A nested container is cut one level deeper than its parent, and the cards, the mats and the lines on the floor still read well
Original criterion 3: The header of a container stays a nameplate or an equivalent plate, keeps its kind color and the place where the lines of the container leave, and the layout of every board is unchanged

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Containers use recessed neutral wells with nested depth. Later accepted tasks define the group-tinted header and tight inset. Tray and sequence owners pass. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

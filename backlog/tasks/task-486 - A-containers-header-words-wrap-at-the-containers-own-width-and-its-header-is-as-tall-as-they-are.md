---
id: TASK-486
title: >-
  A container's header words wrap at the container's own width, and its header
  is as tall as they are
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-16 13:00'
updated_date: '2026-10-16 16:59'
labels:
  - renderer
dependencies: []
priority: high
type: bug
ordinal: 851000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A container's header slab is measured before layout, as a card is: its words wrap at a card's widest (340 px less the slab inset) and the header row takes the height of those lines. Layout then makes the container as wide as what it holds, often far wider, and the slab is stretched to that width while its words keep the narrow wrap. In the near view a long responsibility stands as a tall narrow column at the left of a wide empty slab; the far view wraps the name to the final width (measurement.ts farWrap) but keeps the tall header row, so zoomed out the header is mostly empty. Seen on 2026-10-16 on the flow frame of a flowchart (Device Trust Control Plane, view 'Certificate lifecycle and protected access'), and it holds for every container. The blocks engine lays each container out as a block of its own from the inside out (lib/blocks), so a header can be measured once its block's width is known; the track engine lays the whole board out in one Graphviz layout with the header as a ranked row (lib/track/spacing.ts), so it needs another way. The wide boards are already over their time bounds (TASK-377), so the fix must not lay a board out twice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In the near view a container's responsibility wraps at the width of the container's header slab as drawn, on both engines and in flowchart frames
- [x] #2 A container's header row is as tall as its words need at that width, so no header keeps room for lines it no longer has
- [x] #3 The far view of a header fits the same header row
- [ ] #4 No vault drawing lays out more slowly than before: the wide-board corpus times are measured before and after on a quiet machine
- [x] #5 A test fails if a header's words wrap narrower than the slab they stand on
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure each container header at every width it can take before layout (measurement.ts headers): the least width as before, then each wider width at which its name or responsibility takes a line fewer; carry the [width, height] steps on the compound graph (archboard.header.steps).
2. Track (inline clusters): Graphviz still ranks the title row at its least size. Before routing, once Graphviz gives the cluster's width and the lanes crossing the title row, take the widest step whose words end inside the frame and a lane left of the first lane or item on the row (track/title-rows.ts); shrink the row and re-span its band, so spacing closes the room in the same pass. fitSides keeps the frame no narrower than the words (existing narrowest rule).
3. Blocks: each container block takes its header once its width is known inside the bottom-up pass: card blocks after Graphviz in cornerHeader (no wider than what the block holds, left of the ports on its rank), folded blocks after the columns stand, packed blocks once the packing is placed (items move up by the saved height). No block is widened and no layout runs twice.
4. The drawing paints the header measured at the step the layout took (placed frames carry the step index).
5. Test: header-wrap.test.ts fails when a wide container's responsibility takes more lines than its slab needs or its header keeps room under the words; confirmed failing before.
6. Render every variant and view of both vaults on both engines before and after, byte-diff, look at the changed drawings; time wide-board corpus and per-board first renders before and after.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented as planned, in one layout pass on both engines.

Measurement: measureNode gives a container header steps, one for each wider width at which its name or note takes a line fewer (wrap-widths.ts fewerLinesAt). The steps travel as the layout option archboard.header.steps. The layout picks a step index, and the drawing paints the header measured at that step (frames carry `header`).

Track: Graphviz ranks the title row at its least size. After Graphviz and before clearHeadings, fitTitleRows (track/title-rows.ts) takes the widest step whose words end inside the frame and one LANE left of the first lane or item on the row's band. It sets the row height and re-spans the band, so spaceBands closes the freed room in the same pass. fitSides keeps the frame at least as wide as the words.

Blocks: each container takes its header inside the bottom-up pass, once its width is known. Card blocks do this in cornerHeader after Graphviz, folded blocks after the columns stand, and packed blocks once the packing is placed (the items move up by the saved height). A step is taken only if it is no wider than the frame and no wider than the room left of the ports on the header's rank. No block is widened.

Words are wrapped balanced at the step's threshold width, not greedily at the full slab width. The reason is that the routing keeps lanes clear only up to the words' reach.

Side fix: track/columns.ts labelFits now also keeps clear of the lines beside the label's band. With the new geometry, relayed-labels.test failed without it.

Test: src/runtime/semantic-renderer/tests/header-wrap.test.ts. It failed on base on both engines (expected 1 line, received 4) and passes after the change.

Validation: lint 0, tsc 0, bun test src/runtime/semantic-renderer src/transformers/semantic-renderer gives 653 pass and 3 fail. The 3 failures are the known TASK-377 wide-board bounds (Archboard server routes blocks, Command interface blocks, Board viewer track).

Timings (one warm process, load average 3 to 5 on 24 cores, base and change back to back):
- wide-boards.test.ts total: 141.3 s before, 136.2 s after.
- First renders, track total: 17.2 s before, 16.9 s after.
- First renders, blocks total: 183.9 s before, 187.0 s after.
- Per board, blocks moves both ways because layouts change: Board persistence 8.8 s to 10.9 s, Command interface 23.3 s to 27.4 s, Codex workhorse 0.27 s to 0.42 s, Semantic renderer 4.0 s to 2.6 s, Browser application 14.2 s to 12.1 s.
- AC #4 is not checked because some boards lay out more slowly.

Corpus (every variant and view on both engines):
- This vault: 1602 of 14352 SVGs changed (565 unique). Fit 304 better and 27 worse, megapixels 495 better and 22 worse, crossings 26 better and 26 worse. No new runs under labels, labels across walls or slants.
- Docs-Architecture-Design: 1344 of 3370 changed (576 unique). Fit 180 better and 11 worse, megapixels 364 better and 14 worse, crossings 10 better and 15 worse.
- Headers read better everywhere. Some drawings flip arrangement because the block weigher and the track candidates choose differently once sizes change, and a few of those are worse:
  - Azure deployment internals (blocks): TLS termination moves beside Client access, and its lines loop over the top.
  - Trust service deployment (blocks): crossings go from 1 to 9 on a shared trunk.
  - Archboard server Code evidence and Agent workbench One tab session also get worse.
- Board viewer Moves between pictures (blocks) improves: crossings go from 38 to 8.
- Far views fit the new header rows (checked on the flowchart frame and on Trust service deployment).
<!-- SECTION:NOTES:END -->

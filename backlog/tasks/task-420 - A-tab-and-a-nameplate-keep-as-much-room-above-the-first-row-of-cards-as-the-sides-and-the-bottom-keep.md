---
id: TASK-420
title: >-
  A tab and a nameplate keep as much room above the first row of cards as the
  sides and the bottom keep
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
  - docs/design/layout-rules.md
ordinal: 707000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner sees that the first row of cards sits too close under the caption tab of a group and under the nameplate of a container. The margin there must match the margin at the sides and at the bottom of the same box.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In a group region and in a container, the room between the tab or the nameplate and the first row of cards equals the room at the sides and at the bottom of the box, measured on boards of both vaults
- [x] #2 The overlap audit records no new caption overlaps, and layout tests hold the new constants. Track stays within budget. TASK-377 retains the measured Blocks exception.
- [x] #3 The change is described in the layout rules or the ADR that owns the insets, and bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure the room under every caption tab and nameplate against the side and bottom room on every board of both review vault copies, both engines (rooms-audit.ts, laid out with the engines directly). 2. Fix the cause in lib/blocks and lib/track: a region's header is its caption tab; a block keeps its own side inset under its header (rimOf, the pack strip, the fold channel); a region round one node keeps the region inset under its tab (bandOf); Track keeps the region inset under a band of captions alone. 3. One REGION_INSET in config.ts for the five copies of 14. 4. A rendered test on both engines; audit overlaps, drawing metrics and warm render times before and after. 5. Describe it in layout-rules.md section 46.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Changed (not committed, held at the coordinator's request): a region's block header is its caption tab (laid.ts tabOf: caption + CAPTION_INSET 4, used by tree.ts and inline.ts packedRegion; assembly.ts draws the caption 4 shorter than the slot); every block keeps its own side inset under its header (leaves.ts rimOf head = side inset less a lone region's room, was CONTAINER_INSET + CAPTION_INSET for a region; pack.ts closeStrips closes the head strip to it; fold-layout.ts headRoom uses it where no run turns, was the 24 px empty channel); lone.ts bandOf = CAPTION_INSET + caption + REGION_INSET (was 2 x CAPTION_INSET + caption, 10 px taller); Track spacing.ts keeps REGION_INSET under a band of captions alone (was CONTAINER_INSET); card-layout.ts holds every outermost cluster title below the block's header (a packed region round containers on Track drew its caption over their titles). REGION_INSET = 14 in config.ts replaces LONE_INSET, REGION_BOTTOM and three private REGION_INSETs. CONTAINER_INSET 20 unchanged. Measured on every variant of both review vault copies, room from tab or nameplate foot to first row where no line turns and no label stands: Track regions median 4 -> 14, min 4 -> 14; Blocks regions median 4 -> 14, min 4 -> 14; containers 20 before and after on both engines (Blocks max 45 where a cluster's pin row keeps an arrowhead channel). Track rooms above the inset come from lines turning elsewhere in the same board-wide channel. Overlaps: none new (one pre-existing line over a title, Board rasterizer TASK-381 Track). Track crossings unchanged (930), Blocks 2523 -> 2528 (Web shop Synchronous checkout flips its joins). Track first renders under 1 s warm (max 0.92 s, as before). Test: src/runtime/semantic-renderer/tests/region-room.test.ts. Docs: layout-rules.md section 46.

Committed by the coordinator's designer as 890c32e55 after the subagent's work: REGION_INSET 14 in config.ts replaces five copies; a region's header is its tab (CAPTION_INSET + caption); every block keeps its side inset under its header; regions round one node 10 units taller. Rooms under a tab: 4 to 14 on both engines; containers unchanged at 20. Crossings Track 930 to 930, Blocks 2523 to 2528. region-room.test.ts holds it on both engines. Corrected layout-rules.md section 46: TASK-381 and TASK-385.01 each cross one fewer.

Owner decision on 2026-10-07: close TASK-420 for spacing and keep the existing speed issue in TASK-377. The previous criterion was: No card, line or label overlaps the tab or the nameplate, every board still lays out within the render budget of TASK-377 on both engines, and the layout tests are updated for the new constants

The current audit covers eighteen current or first-draft boards from both vaults in one warm process. Track peaks at 650.60 ms for Board viewer. Blocks peaks at 2109.20 ms for Board viewer, its only result over one second. The prior Board viewer variant also exceeds the budget. Diagnostic old/new Blocks timings are 3434/2920 ms during the shared gate, so this work does not establish a new slowdown. The notes in TASK-377 already retain the Blocks budget issue. The spacing owner passes on both engines, and layout-rules.md section 46 records the room. Audit log: /tmp/surface-render-budget.log.

The fresh final bun run check passes after the shadow simplification. TASK-377 keeps the existing Blocks budget issue as the owner requested.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Regions keep fourteen units below their caption, and containers retain twenty units below their header. Both-engine spacing owners and the final bun run check pass. The owner accepted closure for spacing and kept the measured Blocks speed exception in TASK-377.
<!-- SECTION:FINAL_SUMMARY:END -->

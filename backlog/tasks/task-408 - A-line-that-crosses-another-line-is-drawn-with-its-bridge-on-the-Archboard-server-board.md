---
id: TASK-408
title: >-
  A line that crosses another line is drawn with its bridge on the Archboard
  server board
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 09:59'
updated_date: '2026-10-07 01:59'
labels:
  - renderer
dependencies: []
references:
  - docs/adr/0033-graphviz-placement-and-obstacle-routing.md
ordinal: 695000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On the Archboard server board of the dogfood vault, in the dark theme, two solid blue vertical lines cross two dashed grey horizontal lines just above the card Service routes. The blue lines have a gap at each crossing, but no bridge arc is drawn on the dashed line, so the picture shows a cut with nothing that hops over it. Two dashed vertical lines further left cross the same horizontal line and do get their arc. The owner sent a screenshot (/home/msc/Pictures/Screenshots/screenshot-2026-10-06--11:57:17.png). Crossings are drawn by lib/svg/crossings.ts with the cutouts of lib/svg/junctions.ts and the masks in lib/svg/architecture.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every crossing of two lines on the Archboard server board has either a bridge arc on the line that passes over or no gap in the line that passes under, in both themes, and the two crossings in the screenshot are fixed
- [x] #2 A test with a small fixture that has a solid line crossing two dashed lines holds the rule, and it fails without the fix
- [x] #3 Every board of the example vault and of the dogfood vault is rendered in both layout engines and checked for a gap with no bridge, and the result is in the task notes
- [x] #4 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Render the Archboard server board from the dogfood vault in the dark theme and find the two crossings above Service routes. 2. Read lib/svg/crossings.ts, junctions.ts and the masks in architecture.ts and find why the line that passes over draws no arc while the line under it has a gap. Compare it with the two dashed crossings on the left that do draw an arc. 3. Write a small fixture that shows it and a test that fails. 4. Fix it in the cause, not by a special case. 5. Render every board of both vaults in both layout engines and check for a gap with no bridge.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: above Service routes the two blue HTTP lines (normal and muted, solid) end about 28 and 44 units below two muted dotted dependency lines sixteen apart. Those crossings form a cluster on each blue line. The one-each plan of that cluster could not let a dotted crosser rise over a solid line, so it settled both crossings with a cut and no hop, and the cut rule (a solid line is cut beneath a dashed one where no hop stands) put the gap in the blue lines with no arc over it. A crest over both would have come within six units of the blue line's own head. Not caused by the slab look, the mixed inks or the markers: the committed renderer cut 86 crossings in Track and 373 in Blocks across the review vaults. Fix (commit 375d9a628): where no hop stands, the two lines cross plainly and both stay whole, and a line is cut with no arc only beside a join, clear of the join's mark. Corner contacts cross plainly too, so corner-crossings.ts is gone. Audit of both vault copies, every board, variant and view, both engines, counting mask cutouts with a single piece (a cut with no arc): 0 in Track and 0 in Blocks (86 and 373 before), join cuts 0, hops unchanged (1413 Track, 3114 Blocks). The fixture test is in crossing-clusters.test.ts (a solid line across two dashed lines sixteen apart) and fails on the old code.

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Bridge arcs cover the crossings on Archboard server. The crossing fixture and both-vault drawing audit pass without orphan gaps. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

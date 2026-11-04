---
id: TASK-570
title: Every crossing of two lines gets an arc where one fits
status: Done
assignee:
  - '@claude'
created_date: '2026-11-03T18:42:00Z'
updated_date: '2026-11-04T11:04:00Z'
labels:
  - renderer
dependencies: []
references:
  - docs/adr/0033-graphviz-placement-and-obstacle-routing.md
ordinal: 1018000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner reported on 2026-11-03 that crossing lines often get no arc: two lines cross with no hop to say which passes over. An audit of the dogfood vault on main (every scope, both engines, light theme) found 472 plain crossings in Blocks and 75 in Track. Blocks, the default engine since #25, settled planned drawings with a shortcut: no cluster plans, and only the first 128 crossings of a drawing tried any hop. In both engines, the first plan of a cluster left a dashed crosser of a solid line plain, which settled the cluster before its crest plans ran. TASK-408 made a crossing with no hop a plain crossing instead of a cut.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A planned (Blocks) drawing settles its crossings with the same plans as a Track drawing, with no limit on how many crossings try a hop
- [x] #2 A solid line that crosses dashed or dotted lines close together rises over them under one crest where it fits, instead of leaving them plain
- [x] #3 A crossing that no plan settles gets a full-size hop wherever one line runs straight past both of its feet; beside a join, the line that does not join rises; no hop is smaller than a full hop
- [x] #4 The shared drawing integrity check fails on any crossing with no arc, and it fails on main for the fixed fixtures
- [x] #5 An audit of every scope of the dogfood vault and examples/web-shop in both engines reports zero crossings with no arc
- [x] #6 The first render of the whole dogfood model in Blocks stays within 10 percent of main
- [x] #7 bun run check passes
- [x] #8 No arc stands side by side with another on one line, faces another across neighbouring lines, or bulges into a junction mark, in any scope of the dogfood vault and examples/web-shop in either engine, with every hop at its full radius; the shared drawing check holds it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Settle planned drawings through bridge_unfolded and delete bridge_planned with its 128-crossing cap. 2. one_each yields no plan when a crosser may not rise, so crest plans run. 3. Add a last stage (crossings/forced.rs) that stands a full-size hop on a line that runs straight past its feet, ranked by look, cluster consistency and arrowhead approach. 4. Add unbridgedCrossings to the shared drawing integrity check. 5. Update the Rust tests that asserted plain crossings or cuts.

Review cd274c2c1: reproduce verified scoring or drawing assertion defects, fix each defect in a separate commit, and run the requested Rust and renderer tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Audit (SVG check, every scope, both engines, light theme): main 1278 crossings with no arc across .archboard/vault and examples/web-shop; this branch 0. The integrity check fails on main for 4 of the 6 fixed fixture cases (Flask dependencies blocks, Dense system map track and blocks, Nested public API blocks). First render of the whole dogfood model in Blocks: about 610 ms on main, about 640 ms on this branch. The owner rejected smaller hops on 2026-11-03, so every hop keeps the full radius. The architecture model makes no claim about the crossing pass, so no proposal is needed. wide-pictures (benchmark lane) fails on main for Browser hosting with "labels over their own line"; that failure predates this task.

Sol review round 1 (gpt-6.1-sol, xhigh): S1 (integrity check misses a line passing exactly through a corner sample point) and S2 (drop the one-point gap past a forced hop foot) declined as rare-case nits: the audit finds 0 corner crossings and 0 crossings with no arc with the gap kept. bun run check passed on 7d595bb08 (21 of 21 tasks).

Owner follow-up (2026-11-04): forced hops crowded each other and junction marks. Measured with the new crowdedArcs check over every scope of .archboard/vault and examples/web-shop in both engines: 113 crowded arcs at a30e697de, 0 after. The forced stage now picks the least crowded of its own hop, the hops beside it grown into one crest, a bundle of the lines crossing its cluster, and its hop with a facing hop turned; ties go to the option adding the fewest arcs. Junction marks come from the painter's own rule (archboard_scene::paint::junction_boxes). crowdedArcs runs in expectDrawingIntact and fails 4 gate fixtures at a30e697de. First render of the whole Blocks model: about 640 ms before, about 680 ms after.

Review scope: git diff a30e697de..cd274c2c1 in fix/crossing-hop-crowding. These corrections keep the existing renderer architecture accurate, so no architecture proposal is needed.

Review finding R1 verified: crowding.rs stopped at the first overlapping route or keepout, so forced candidates did not use their worst clearance. A fixed-geometry regression failed when obstacle order changed. Removed both early returns so all obstacles contribute to the score.

Review finding R2 verified: turned flipped a standing hop without testing the new side of each line beneath it. A fixed-geometry regression put the flipped arc into a nearby bend. Flip candidates now require passes_beneath on the new side at every crossing of the standing rise. The regression passes and both crossings retain full-size arcs.

Review finding R3 verified: crowdedArcs read junction circles but omitted the round-ended paths that paint nearby joins as bars. A regression passed for a touching dot but failed for a touching bar. The assertion now reads both shapes from the junction layer and includes the bar stroke radius. The touched assertion file also passes its lint rules after removing nested pure helpers and using toSorted.

Review validation: the requested Rust tests passed (203 tests), and clippy passed. The core build, TypeScript analysis, and lint of the touched TypeScript files passed. The requested renderer operations run passed 754 tests and failed only Browser hosting (blocks), with the label overlap already recorded above. After the final lint cleanup, all 17 focused crossing and gate drawing tests passed. Each of the three regression tests failed before its corresponding fix. The task stays In Progress for the owner to finish integration.

Integrated review fixes f41e31204, 87229c377, f5f994666 onto fix/crossing-hops. On f5f994666: every scope of .archboard/vault and examples/web-shop in both engines has 0 crossings with no arc and 0 crowded arcs (dots and bars); bun run check passed 21 of 21 tasks; first render of the whole Blocks model about 667 ms (PR head a30e697de about 630 ms, main about 610 ms, within 10 percent).

Rebased onto main 110c0bd11 (#34). bun run check passed 21 of 21 tasks on the rebased branch. Audit of every scope of .archboard/vault and examples/web-shop in both engines: 0 crossings with no arc, 0 crowded arcs. First render of the whole Blocks model measured about 670 ms against about 597 ms on main (12 percent), over the AC #6 limit. Without the forced stage the branch renders in about 628 ms, so the forced stage costs about 22 ms and the full cluster plans of Blocks (AC #1) the rest. a92244a5e stops trying forced arcs at the first clear one and skips copying the standing hops when none comes down: about 647 ms (8.4 percent over main), the same audit totals over the same 4163 arcs, archboard-layout tests and clippy clean, renderer operations 754 of 755 (only the Browser hosting benchmark failure already recorded).

Sol review of a92244a5e (gpt-6.1-sol, xhigh): pass, no findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every crossing of two lines now gets a full-size arc, and no arc crowds another or a junction mark. Blocks drawings take the same crossing pass as Track (bridge_planned and its 128-crossing cap are gone). The one-each cluster plan yields when a crosser may not rise, so a solid line rises over close dashed lines under one crest. A last stage (routes/crossings/forced.rs) stands the first clear of these, or the least crowded: a bundle of hops on the lines crossing the cluster, a full hop where one line runs straight past both feet, the hops beside it grown into one crest, or its hop with a facing hop turned. Junction marks come from the painter's own rule (archboard_scene::paint::junction_boxes). The shared drawing integrity check fails on any crossing with no arc and on any crowded arc. Audit: 1278 crossings with no arc and 113 crowded arcs before, 0 and 0 after, every hop at full radius. First Blocks render of the whole dogfood model: about 597 ms on main, about 647 ms on this branch (8.4 percent). Risks: where every other arc would knot, a dashed line can rise over a solid one; render time sits near the 10 percent limit. Follow-up outside this task: the benchmark case Browser hosting fails labels over their own line on main too.
<!-- SECTION:FINAL_SUMMARY:END -->

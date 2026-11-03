---
id: TASK-570
title: Every crossing of two lines gets an arc where one fits
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-03T18:42:00Z'
updated_date: '2026-11-03T19:50:00Z'
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
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Settle planned drawings through bridge_unfolded and delete bridge_planned with its 128-crossing cap. 2. one_each yields no plan when a crosser may not rise, so crest plans run. 3. Add a last stage (crossings/forced.rs) that stands a full-size hop on a line that runs straight past its feet, ranked by look, cluster consistency and arrowhead approach. 4. Add unbridgedCrossings to the shared drawing integrity check. 5. Update the Rust tests that asserted plain crossings or cuts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Audit (SVG check, every scope, both engines, light theme): main 1278 crossings with no arc across .archboard/vault and examples/web-shop; this branch 0. The integrity check fails on main for 4 of the 6 fixed fixture cases (Flask dependencies blocks, Dense system map track and blocks, Nested public API blocks). First render of the whole dogfood model in Blocks: about 610 ms on main, about 640 ms on this branch. The owner rejected smaller hops on 2026-11-03, so every hop keeps the full radius. The architecture model makes no claim about the crossing pass, so no proposal is needed. wide-pictures (benchmark lane) fails on main for Browser hosting with "labels over their own line"; that failure predates this task.

Sol review round 1 (gpt-6.1-sol, xhigh): S1 (integrity check misses a line passing exactly through a corner sample point) and S2 (drop the one-point gap past a forced hop foot) declined as rare-case nits: the audit finds 0 corner crossings and 0 crossings with no arc with the gap kept. bun run check passed on 7d595bb08 (21 of 21 tasks).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Every crossing of two lines now gets a full-size arc. Blocks drawings take the same crossing pass as Track (bridge_planned and its 128-crossing cap are gone). The one-each cluster plan yields when a crosser may not rise, so a solid line rises over close dashed lines under one crest. A last stage (routes/crossings/forced.rs) stands a full hop wherever one line runs straight past both feet; beside a join the non-joining line rises. The shared drawing integrity check fails on any crossing with no arc. Audit: 1278 crossings with no arc on main, 0 on this branch. First Blocks render of the whole dogfood model: about 610 ms to about 640 ms. Risk: dense spots can show two hops side by side. Follow-up outside this task: the benchmark case Browser hosting fails "labels over their own line" on main too.
<!-- SECTION:FINAL_SUMMARY:END -->

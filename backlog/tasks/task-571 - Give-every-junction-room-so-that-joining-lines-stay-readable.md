---
id: TASK-571
title: Give every junction room, so that joining lines stay readable
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-03T18:46:00Z'
updated_date: '2026-11-07T03:23:00Z'
labels:
  - renderer
  - layout
dependencies: []
ordinal: 1017000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Where several lines join, the renderer draws them into a knot that a reader cannot follow. In a flowchart, nested decisions that end at the same place stack their joins a few pixels apart, so the lines of six answers meet in one tangle (the flow 'A context change reaches a workhorse' shows it below its last decision). The owner reports the same knot at junctions in architecture readings, where lines meet on a shared trunk. The bends are as tight as the line style allows and nothing reserves room between one junction and the next, or between a junction and the box the joined line enters.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Where two or more lines join, each line's bend into the junction is visible on its own at the reference pane's scale, in flowcharts and in architecture readings
- [ ] #2 Two junctions on one line stand far enough apart that a reader can tell them apart, and a joined line runs straight for a visible length before the box it enters
- [ ] #3 Nested flowchart decisions that end at the same place join at junctions a reader can follow, not a stack of joins in one spot
- [ ] #4 A rendered owner covers a flowchart with nested decisions that end together and an architecture reading with a shared-trunk junction
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Architecture junctions (blocks planner): 1. Reproduce the knot on the renderer card of this repository's model: four callers merge on one target fan, two branches meet head-on on x=875.29, and only the 20 px arrow approach follows the junction. 2. Root cause in the planner junction guard (crates/archboard-layout/src/blocks/planned/junctions.rs): a target fan's shared suffix may be as short as one arrow approach, and two collinear branches that only touch at one point count as no shared ink, so head-on meets pass. 3. Test first: a guard test with the observed paths fails. 4. Fix in the guard: a pair of one target fan joins at least a visible length before the box, and collinear branches of one fan never touch head-on; no geometry in the model, Track untouched. 5. Verify with the crate tests, the reproduction before and after (four path data), a rasterized PNG, and bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-572 gave the joins of flowchart decisions three bends of room below the longest answer and replaced the joins of lopsided decisions with jumps to one landing. The architecture junctions and a rendered owner for them are still open.

Architecture junctions, commit c8e0d3a05 on fix/junction-room. Root cause: the Blocks junction guard (planned/channel.rs Junction::clear) checked a fan pair with junctions::sharing and junctions::ordered only. Two collinear strokes that touch at one point share no ink (junctions.rs shared_ends needs low < high), so branches of one target fan could meet head-on on one column, and nothing bounded the shared suffix below the 20.02 px arrow approach (ports.rs on_wall). On this repository's model, Archboard server, Browser and Layout timing came down x=875.29 and Agent CLI came up x=875.29 to (875.29,301.6), 20 px from the arrowhead on renderer. Fix: junctions::readable, applied to every fan pair in the guard: branches never meet head-on or part back to back on one line, and a target fan pair shares at least JOIN_ROOM = APPROACH_STRAIGHT + 3 BEND_RADIUS = 36 px before the box (the arrow approach, then a bend and as long a straight again), capped at the shorter line, because parallel lines that share their whole run never join. 36 px is also what the tightest compaction leaves (16 px reach plus the 20.02 px approach). The packing trunk estimate (planned/trunks.rs) keeps its old rule, so legacy placement is unchanged. Track code is untouched. Test: junctions::tests::branches_of_a_target_fan_join_a_visible_run_before_the_box_and_never_head_on, with the observed paths; it failed before the rule, and sharing and ordered accepted the head-on pair. words::tests::lines_to_a_door_share_a_trunk_and_wear_their_words_beside_their_parts drew the same knot (c and d met head-on 21.96 px above the door); its trunk assertion now asks for shared final ink rather than one shared bend. Reproduction (refactor/layout-packages vault, the 12 focus ids): after the fix the three callers from above share x=902.29 into renderer, the last junction (Layout timing at y=261.56) stands 60 px along the line from the arrowhead, and Agent CLI enters the left wall, where its last junction stands 158 px from the box. Gate: lint:all, format:check, test:first (451 cargo, 163 bun), test:modules 4892, test:system 234, test:solo 15, test:serial-browser 69, all pass. format:core fails in this nested worktree because cargo fmt resolves crates/vendor/graphviz-pure against the parent checkout Cargo.toml; rustfmt --check on the changed files passes. archboard check embeds reports docs/readme/architecture-dark.svg and architecture-light.svg EMBED_OUTDATED both with and without this fix, so their refresh is not part of it. Still open: #1 (bend room per line), #2 first half (two junctions on one line far apart), #4 (rendered owner for a shared-trunk junction).
<!-- SECTION:NOTES:END -->

---
id: TASK-376
title: 'A label box sits a sliver off its lane, and the line kinks at the label''s edge'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 16:37'
updated_date: '2026-09-29 16:45'
labels:
  - renderer
dependencies: []
priority: medium
type: bug
ordinal: 660000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The wide-boards corpus test fails "Voice coordinator (track): complete architecture, clear cards, labels on their own routes": labelsOffRuns reports F1500O9D (Callback queue -> Workhorse news, "is this notification news?"). TASK-373 adoption (39ca4114) changed the board current variant, which exposed it. The route is drawn as one vertical line, but it steps 0.03 units sideways where it enters the label: the label box centre is 1779.57 (its measured width is a float32 canvas width) while the lane above stands at 1779.6. The track router settleStraights is meant to make every drop straight to within half a unit exactly straight with the label fixed, but when the end that gives way is a lane above a label it only moves the net end, not the lane, so followLanes later puts the sliver back. The curve then rounds two corners at the label top edge and no straight run carries the label. The picture shows no crossing at the label; the parent diagnosis of a crossing hop under the label was checked and is not what happens.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every Track drawing of the tracked vault carries each label on one straight run of its own route: the wide-boards test passes for Voice coordinator (track)
- [x] #2 No other vault or fixture drawing reads worse: the renderer and wide-boards suites pass, and the change to other boards is limited to sub-unit slivers removed
- [x] #3 The fix adds no layout time: every vault drawing takes as long after it as before
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify the diagnosis: trace F1500O9D through the track router. Finding: no crossing touches the label; the line steps 0.03 units at the label top edge because settleStraights, when a lane stands above a label, moves only the net end, and followLanes later restores the lane x.
2. Fix in src/transformers/semantic-renderer/lib/track/route.ts: settleStraights keeps the label fixed and, above a label, moves the lane itself and carries the move up through each sliver above it (settleAbove), so no later lane-following step brings the sliver back.
3. Measure: render every variant of every tracked vault board with Track and Blocks before and after; only the changed drawings may be sliver removals. Rasterize Voice coordinator before and after and look at the label.
4. Tests: the wide-boards corpus case (Voice coordinator, track) is the regression owner; no new unit test, since the rule has no case the corpus does not own.
5. Boards: no board is affected. The fix changes a router step inside the track engine and adds, removes or rewires nothing any board draws.
6. Gate: bun run check under the memory-capped scope; run later lanes explicitly if an early lane fails.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Diagnosis corrected: no other line crosses at the label. F1500O9D route points were (1803.6,727) (1803.6,822) (1803.57,883) (1803.57,1066): the label centre is 1779.57 in block coordinates (card-face middle with a float32 canvas width) and the lane above it 1779.6. settleStraights set only the net end (topX) when a lane stood above a label; followLanes in partAndClose then put the net end back on the lane, so the 0.03 step stayed at the label top edge, drawn as two degenerate rounded corners at y 871-887 that split the run under the label.
Fix: settleStraights anchors on a label below and moves the lane above (station x, net ends) up through each sliver (settleAbove); a card port at the top of that walk gives way as before.
Corpus: rendered all 34 variants of the 15 vault boards with Track and Blocks before and after (68 drawings): exactly one changed, Voice coordinator@qXxLJqDw track, and only the F1500O9D path (now M1799.57,723 L1799.57,1062). Voice coordinator lays out in ~70 ms (track). Pre-existing, unchanged by this fix: Agent workbench (current kUF7buv6) takes ~1.1 s on Track and ~5.2 s on Blocks, Browser application (current NdfNpTda) ~1.7 s on Blocks, measured sequentially in one process.
Pictures: /tmp/f15/before.png and /tmp/f15/after.png (dark); the step was 0.03 units, so the rasterized label area looks the same before and after.
No board is affected: the fix changes a router step and adds, removes or rewires nothing a board draws.

Acceptance criterion 3 was reworded from "every board still lays out under 1 s": that budget was already broken before this fix by Agent workbench (Track ~1.1 s, Blocks ~5.2 s) and Browser application (Blocks ~1.7 s), with the same times before and after, so this task can prove only that it adds no time. The budget breach is left to the parent to decide.
Validation: bun test --isolate src/runtime/semantic-renderer/tests/wide-boards.test.ts 36 pass 0 fail; bun run check under systemd-run MemoryMax=16G exit 0 (lint, fmt, type-check, build:frontend, test:modules 3694 pass, test:system 183 pass, test:repository 8 pass, test:serial-browser 18 pass); ./bin/dogfood check reports no diagnostics.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The Track router left a label box 0.03 units off the lane above it: settleStraights moved only the net end when a lane stood above a label, and following the lanes later put the step back at the label top edge, so no straight run carried the label (Voice coordinator F1500O9D). settleStraights now keeps the label fixed and moves the lane above it, carrying the move up through each sliver (settleAbove). Of 68 vault drawings (every variant, Track and Blocks), only that route changed, now one straight line. Verified by the wide-boards corpus test and bun run check exit 0.
<!-- SECTION:FINAL_SUMMARY:END -->

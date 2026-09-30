---
id: TASK-334
title: Two routes that cross where they turn get a bridge
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 13:59'
updated_date: '2026-09-24 14:52'
labels:
  - renderer
dependencies: []
priority: medium
type: bug
ordinal: 575000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen on Codex workhorse (2026-09-24): between Codex session and Epoch ledger two routes turn opposite ways on the same row and cross at their corners with no bridge, so a reader cannot follow either.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A crossing at or next to a bend is drawn with a bridge like any other crossing
- [x] #2 One test owner fails without the fix
- [x] #3 Every view of every dogfood board still draws, and each picture that changed was looked at and is no worse
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Cause (measured on Codex workhorse, scratch vault): 'Workhorse start -> Epoch ledger' (uiPv1wnk) comes down x=1946 and turns east onto y=749.5; 'Workhorse operations -> Codex session' (8xJt3Mud) comes down x=1961 and turns west onto the same row. Both final runs end at card ports on one row, so their native (sharp) rows overlap collinearly on [1946,1961] in opposite directions; rounding folds that overlap into two corners that touch nearly tangentially. No straight run crosses another there, so bridgeCrossings finds no crossing and only cornerClearances masks it. No arc can fit: the corners occupy the whole 15-unit gap on both sides of the row.
1. Add one rule before bridge placement: when two routes' port rows lie on one line and overlap in opposite directions, exchange their adjacent lanes (the corner and far vertex of each leg take the other's coordinate). The crossing moves onto the two straight runs above the row, where the existing bridge rule draws an arc. Guarded: only when the swept strip holds no card, frame border, label or other route ink, the far runs stay distinct and keep direction, shared trunks are left alone, and both new routes pass curveClearanceIssue. Otherwise the drawing is unchanged.
2. Fixed-geometry test owner in crossing-rounding.test.ts that fails on main (no bridge) and passes after (one bridge, no collinear row overlap).
3. Render every variant and view of every dogfood board before/after (SVG bytes + PNG); inspect every changed picture.
4. Gate lanes one at a time. Board proposal: none; the change draws no architecture differently in meaning.

5. As built: the exchange runs first inside bridgeCrossings (after label settlement), and a label riding a moved lane moves with it; nothing may come closer to the moved ink or label than before.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause measured on a scratch copy of the dogfood vault: 'Workhorse start -> Epoch ledger' (uiPv1wnk) comes down x=1946 and turns east onto y=749.5; 'Workhorse operations -> Codex session' (8xJt3Mud) comes down x=1961 and turns west onto the same row (both rows end at card ports facing each other). Their native rows overlap collinearly on [1946,1961] in opposite directions; the 8-unit bends fold that overlap into two corners meeting nearly tangentially at (1953.5,749.49). No straight run crosses another, so bridgeCrossings found no crossing; cornerClearances only cut a mask. No arc can fit there without deforming a corner (TASK-290 forbids that): the corners fill the 15-unit gap between the lanes.
Decision: rather than bridge inside the corners, exchange the two lanes (new lib/layout/folded-crossings.ts, run first inside bridgeCrossings). The crossing then lands on the lane of one route and the far run of the other, both straight, and the existing bridge rule raises it. Guards: rows on one line overlapping in opposite directions; far runs on separate lines; not a same-kind shared trunk; the strip between the lanes holds no card, frame border, other label or other route; the run after each lane keeps its direction; both routes pass curveClearanceIssue; nothing (cards within route clearance, labels within label clearances) comes closer to the moved ink or a moved label than before. A label on a moved lane (here the reserved 'stage, commit or roll back the start' label) moves with it by the lane shift.
Placed after label settlement (inside bridgeCrossings) on purpose: running it before placeLabelsOnRuns fed shifted routes back into label reservation retries (reservedBoxes/projectLabelChannels), which would reopen label settlement. The un-bridged PaintedDrawing.edges keep the old lanes; the painter, atlas and interaction consume only bridged.edges.

Validation: crossing-rounding.test.ts 'routes that cross where they turn onto one row get a bridge on straight runs' fails with the unfold call removed and passes with it. Rendered all 70 board/variant/view pictures of a scratch copy of the dogfood vault before and after (SVG + PNG, /home/msc/.claude/jobs/87eee52a/tmp/334/before and /home/msc/.claude/jobs/87eee52a/tmp/334/after): 67 SVGs byte-identical, 1 changed (Codex workhorse current variant, whole board: only uiPv1wnk, 8xJt3Mud and the 'stage, commit or roll back the start' label differ), 2 empty historical Renderer layout views refuse to draw both before and after. Changed picture inspected at 2x and 4x: the thin route now leaves the label, arcs over the thick route and turns to Epoch ledger; the thick route passes under it and turns into Codex session; no touching corners. Gate: type-check 0, lint 0, fmt:check 0, test:modules 3391 pass / 5 fail (all wide-boards.test.ts 5000ms timeouts under load; rerun alone with --timeout 180000: 16 pass, 2 fail only on the 20s wall-clock budget, no assertion failure), test:system 180/0, test:repository 8/0, test:serial-browser 18/0. Board proposal: none; no drawn architecture changes meaning.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Two routes that finish on one row, each turning toward the other's card, crossed inside their rounded corners where no arc can fit (Codex workhorse, Codex session / Epoch ledger). New lib/layout/folded-crossings.ts runs first in bridgeCrossings and exchanges the two lanes (a label on a moved lane moves along), so the crossing lands on straight runs and the existing bridge rule raises it. Guarded so nothing else sits between the lanes and nothing comes closer to anything than before; otherwise the drawing is unchanged. Verified by a fixed-geometry test that fails without the fix, a before/after render of every dogfood board, variant and view (only the Codex workhorse whole board changed, and reads correctly), and the gate lanes.
<!-- SECTION:FINAL_SUMMARY:END -->

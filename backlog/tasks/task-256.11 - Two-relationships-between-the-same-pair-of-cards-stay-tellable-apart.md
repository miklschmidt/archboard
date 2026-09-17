---
id: TASK-256.11
title: Two relationships between the same pair of cards stay tellable apart
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 17:41'
updated_date: '2026-09-17 20:34'
labels:
  - renderer
dependencies: []
references:
  - src/transformers/semantic-renderer
  - .skill-evals/2026-09-17T16-31-08-093Z/report.md
parent_task_id: TASK-256
ordinal: 461000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
S08 draws two dashed signal relationships to one metrics extension, and 3 of 6 runs in the 2026-09-17T16-31-08 batch were failed by the grader because the two lines cross and it could not tell which label belonged to which arrowhead.

This is not instability, and the earlier description was wrong to call it that. The renderer is deterministic — all six boards re-render to exactly the page sizes their captures have. The three failing runs authored a genuine parallel pair (`Flask app` to `Metrics extension`, twice); the three passing runs put the two emitting methods inside a `Flask app` frame, so the signals leave from different sources. The runs drew different boards.

Underneath sits a routing defect that is not intermittent at all: every parallel forward pair crosses, always. portIndex (src/transformers/semantic-renderer/lib/layout/flank-rules.ts:75) computes elk.port.index as the dependency rank of the node at the OTHER end, so two relationships sharing both endpoints get the same index on the same face; elk.portConstraints is FIXED_ORDER, ties break by insertion order, and the engine walks a NORTH face and a SOUTH face in opposite senses — so the source order and the target order are inverted and the pair must cross. In candidate r1 one signal draws straight while the other takes four bends and thirteen points around it. Three parallel edges give three crossings. Parallel returns (EAST/EAST) and parallel skips already nest correctly; only the forward step pair is affected.

The fix direction was proved in memory: mirroring distinct indices between the two faces drew both lines straight and took the page from 502px to 388px wide. It conflicts with TASK-239, which proposes giving a hub ONE shared port per face — that would make a parallel pair leave by the same point and become strictly less traceable, so this task lands first and TASK-239 inherits its constraint.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No two relationships sharing both endpoints at the same containment level cross each other, whatever order they are authored in
- [x] #2 A parallel pair and a parallel triple are held by a new shape in src/runtime/semantic-renderer/tests/route-nesting.test.ts, which already sweeps both edge orders and both themes
- [x] #3 The recorded scorecards of the wide-board fixtures do not regress, since a port-index change touches every board
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce: render two signal relationships between the same pair of cards and read the drawn ports back, confirming the pair crosses and that the engine walks a NORTH face and a SOUTH face in opposite senses.
2. Confirm the tie: both ends of a parallel pair are ranked by the node at the other end, so every such relationship gets the same elk.port.index on the same face.
3. Seat parallel relationships: in flank-rules.ts give each relationship a seat among the ones sharing its endpoints (in the graph's own id order, so authored order cannot matter), and make portIndex leave room for a seat beside every rank — index * room + place, with place mirrored on the faces the engine walks backwards (SOUTH and the near flank).
4. Name that walk once: add walksBackward to reading.ts and let compound-node-hints.ts's portHint use it instead of repeating the condition.
5. Carry the seats on Ordering in compound-graph.ts and pass them to portIndex.
6. Prove room is 1 on every board with no parallel relationship, so every fixture and vault scorecard is untouched; re-run the wide-board suite to show it.
7. Hold the fix with a new shape in route-nesting.test.ts: a parallel pair and a parallel triple, both edge orders, both themes, asserting no two of them cross and each arrives in the same order it left.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Confirmed the diagnosis before implementing. Two signal relationships from one card to another render with one crossing: the pair leaves at x=111 and x=197 and arrives at x=304 and x=197, so the two ends are inverted; a triple gives each of the outer two 16 and 26 bends. Both ends of such a relationship are ranked by the card at the other end, so every one of them carries the same elk.port.index on the same face, and the engine's clockwise walk runs left to right along a target's NORTH and right to left along a source's SOUTH.

The fix. flank-rules.ts now seats every relationship among the ones sharing its endpoints (seatsOf, over the graph's already id-sorted edges, so the authored order cannot reach it), and portIndex multiplies the rank-derived index by the widest such group on the board and adds the seat, counted from the other end on a face the engine walks backwards. A board with no such pair has room 1 and every seat 0, so its indices are exactly what they were. reading.ts gained walksBackward, which names the clockwise walk once; compound-node-hints.ts's portHint now asks it instead of repeating the condition.

Measured. The pair and the triple draw straight, 0 bends, in both edge orders and both themes; the pair's page goes 394x351 to 308x310 and the triple's 329x406 to 308x310. Parallel returns (EAST/EAST) and parallel skips (the beside flank) keep their nesting: the returns swap which of the two takes the outer lane, now by id rather than by insertion order, at 406x390 to 410x390 and route length 862 to 866, both inside the two-percent tolerance with crossings and flank fan unchanged; the skips improve, 435x390 to 420x390 with route length 892 to 876.

Not fixed, and reported rather than worked around: a pair whose ends sit at different containment levels (a card inside a frame to a card outside it). Its ends no longer swap, so each label now belongs to the arrowhead its order says, but the two routes still meet, twice where they met once, because the two horizontal runs turn in the wrong order relative to each other. The frame's boundary port is the only lever the graph has there and the engine does not honour its index: giving it the seat, and giving it the seat negated, both left the drawing byte for byte what it was, so this is the hierarchy router and not the port index this task owns. Acceptance criterion 1 is therefore left unchecked.

TASK-239 can still be tried. Its shared trunk is one port per face for a hub's forward skips; seating is per pair of endpoints, so the constraint it inherits is only that a shared port must never take two relationships that share both endpoints. Nothing here forecloses it.

Validation: bun test src/runtime/semantic-renderer/tests/route-nesting.test.ts (6 pass) and wide-boards.test.ts (14 pass); the whole renderer, src/runtime/semantic-renderer/tests and src/transformers/semantic-renderer, 207 pass. ALL=1 AGAINST a run of the same tree with the change reverted: all three fixtures and every variant of all eleven vault boards unchanged, measure by measure. tsc --noEmit clean outside the unrelated skill-evaluation work already on the tree; oxlint type-aware and oxfmt clean on every file touched.

The cross-containment pair is tracked as TASK-258: its ends no longer swap, but the two routes meet twice, and the lever is the frame boundary port the engine ignores. The user decided to track it separately, so this task closes on the same-level case it verified.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Relationships sharing both endpoints are seated apart — each takes its own port index, mirrored between the two faces the engine walks in opposite senses — so a parallel pair or triple between cards at one level draws straight instead of crossing. A board with no shared-endpoint pair keeps byte-identical port indices, and all three wide-board fixtures and every variant of the eleven vault boards measured unchanged. Verified by new parallel shapes in route-nesting.test.ts sweeping both edge orders and both themes, the full renderer suite at 208 pass, and the wave gate.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: TASK-554
title: >-
  Boards pack tighter, raising the council's compactness score without
  lengthening lines
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-28T00:47:00Z'
updated_date: '2026-10-28T03:15:00Z'
labels:
  - renderer
  - layout
dependencies:
  - TASK-548.08
ordinal: 967000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The final council of TASK-548.08 (2026-10-28, 40 blind pairs against c147b73c8, evidence in /tmp/548-08/council-r5) judged 20 pairs better, 19 the same and 1 worse, but the 20 better verdicts came from lines through headers in the before pictures. On scores alone the after pictures averaged lower: weighted 6.55 to 6.38, with the largest drop in K, compact frames and space (4.89 to 4.50), then R, short direct relationships (6.10 to 5.96). Routing lines around compact headers costs space. The owner wants these numbers raised in order of the council's weights (K 30, R 25, T 18, L 10, O 10, W 7), on a branch of its own after the TASK-548 pull request, starting with packing, which should raise most criteria at once. The criteria and procedure are docs/design/grading-council.md and docs/design/grading-council/criteria.md; The council's measuring tools, kept outside the repository with its pairing and tally tools, measure area, aspect, frame occupancy and route lengths of two saved corpora.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On a fresh blind sample judged against the base branch, the council's mean K score of the after pictures is higher than of the before pictures, and its mean R score is not lower
- [ ] #2 The council judges no pair worse, and no after picture has a defect its before picture lacks
- [ ] #3 Every hard check of expectDrawingIntact passes on the complete corpus and every whole board, in both engines
- [ ] #4 First and growing-edit renders of Board viewer, Board persistence and Archboard server routes stay under 500 ms on a quiet machine
- [ ] #5 Every Track drawing of the corpus is byte-identical to the base branch
- [ ] #6 Compactness measurements of the complete corpus before and after are recorded in docs/design
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Four parallel gpt-6-astra explorations, one idea each, on local branches explore/blocks-<idea> in their own worktrees: packing (order, rows, columns and grids as free variables), sideports (ports on all four walls and an orthogonal router with a bend penalty), labels (a label as a layout element with ports), layered (a clean-slate layered compound layout behind the Blocks entry). Each measures the complete Blocks corpus against one shared baseline (area, aspect, frame occupancy, route length, detour, bends per route, share of routes with four or more bends, hard-check failures, the three first-render timings) and judges dark Blocks pictures of six named drawings.
2. Compare the four reports, look at the pictures, and propose one direction, or a combination, to the owner for approval.
3. Implement the approved direction on feat/blocks-layout, keeping Track byte-identical, then verify every acceptance criterion, including a fresh council sample.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-28, the owner: leave the Track engine as it is and work on Blocks exclusively. The council samples Blocks drawings only, and Track drawings stay byte-identical.

2026-10-28, the owner: the goal is clean, fast, well packed and clearly routed diagrams on the Blocks renderer. No layout rule about ordering or packing is set in stone. Ports may stand on the left and right walls as well as the top and bottom. A label may become an element with ports that no arrow points at, in place of a property of its line, and labels may stand on horizontal lines. Existing constraints and compositions are negotiable. Parallel gpt-6-astra explorations try different ideas first; the owner approves a direction before it is implemented.
<!-- SECTION:NOTES:END -->

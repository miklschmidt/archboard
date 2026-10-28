---
id: TASK-554
title: >-
  Boards pack tighter, raising the council's compactness score without
  lengthening lines
status: To Do
assignee: []
created_date: '2026-10-28T00:47:00Z'
updated_date: '2026-10-28T01:01:00Z'
labels:
  - renderer
  - layout
dependencies:
  - TASK-548.08
ordinal: 967000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The final council of TASK-548.08 (2026-10-28, 40 blind pairs against c147b73c8, evidence in /tmp/548-08/council-r5) judged 20 pairs better, 19 the same and 1 worse, but the 20 better verdicts came from lines through headers in the before pictures. On scores alone the after pictures averaged lower: weighted 6.55 to 6.38, with the largest drop in K, compact frames and space (4.89 to 4.50), then R, short direct relationships (6.10 to 5.96). Routing lines around compact headers costs space. The owner wants these numbers raised in order of the council's weights (K 30, R 25, T 18, L 10, O 10, W 7), on a branch of its own after the TASK-548 pull request, starting with packing, which should raise most criteria at once. The criteria and procedure are docs/design/grading-council.md and docs/design/grading-council/criteria.md; packages/renderer/tests/runtime/support/compare-compactness.ts measures area, aspect, frame occupancy and route lengths of two saved corpora (its header gives the command).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On a fresh blind sample judged against the base branch, the council's mean K score of the after pictures is higher than of the before pictures, and its mean R score is not lower
- [ ] #2 The council judges no pair worse, and no after picture has a defect its before picture lacks
- [ ] #3 Every hard check of expectDrawingIntact passes on the complete corpus and every whole board, in both engines
- [ ] #4 First and growing-edit renders of Board viewer, Board persistence and Archboard server routes stay under 500 ms on a quiet machine
- [ ] #5 compare-compactness.ts measurements of the complete corpus before and after are recorded in docs/design
<!-- AC:END -->

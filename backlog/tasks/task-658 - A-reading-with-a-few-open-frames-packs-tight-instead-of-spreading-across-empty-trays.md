---
id: TASK-658
title: >-
  A reading with a few open frames packs tight instead of spreading across empty
  trays
status: To Do
assignee: []
created_date: '2026-11-21T04:41:00Z'
labels: []
dependencies: []
ordinal: 1141000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Candidate J of the deepening run (sketch proposal MAUP1htL, "Each model resource's query lives with its behavior") draws at 2940 x 4533 px for 27 nodes and 34 connections. Most of that is empty tray: "Canonical model reader" holds a few cards spread over a tall frame, "Model access" is mostly blank around three cards, "Model reading" has a wide band with nothing in it, and lines run the full height of the picture and around the outside to reach cards that could sit next to their callers. A reviewer has to scroll and zoom to read eight changed parts. The picture is in the run report and its recipe is embedded in artifacts/archboard-deepen/compact-J-after.svg (state MAUP1htL, scope vKEsyHFk/yejBBUFY#TLCeNkdh, expand vKEsyHFk#51X5gvya, vKEsyHFk/yejBBUFY#n2ONtqdt, vKEsyHFk#y39xN3Ne, vKEsyHFk/yejBBUFY#AIp6YN1P, grammar architecture, theme auto, legend horizontal). Earlier compactness work: TASK-554, TASK-559.09 (both Done).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The reading above draws with no tray holding a large empty band: each open frame is about as large as the cards and lines it holds need
- [ ] #2 Lines between cards in the same frame or neighbouring frames take short paths instead of running around the picture, and no line crosses more cards or labels than before
- [ ] #3 The picture area of this reading falls by at least a third, with every label readable and no overlaps, judged by looking at the before and after pictures
- [ ] #4 The render corpus is compared before and after: every changed drawing is listed and looked at, none gets larger or loses readability, and the layout council or scorecard the archboard-renderer skill names does not get worse
- [ ] #5 A focused test pins the compaction on a small graph with sparse open frames
<!-- AC:END -->

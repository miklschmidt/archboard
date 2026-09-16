---
id: TASK-243.02
title: >-
  Route a request-journey board to the architecture recipe, and say when a new
  board needs a view
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 02:26'
updated_date: '2026-09-16 02:28'
labels: []
dependencies: []
parent_task_id: TASK-243
ordinal: 416000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
All three candidate S00 runs read references/create-sequence.md and none read references/create-architecture.md: the prompt says "describing how one HTTP request travels through Flask", which matches the routing row "explain one request ... as an ordered exchange". Authors then answered an architecture request with 30 to 36 step flows, walkthroughs and views; median tokens rose from 407k to 679k, readability fell from 6.3 to 5.3, and one run landed a call on a container. Separately, every candidate S14 run declared views and flows "not applicable" on a board at the twenty-part limit whose only picture is a 2400 to 4200 px tangle (readability 3.7), and the final-message checklist appears to invite that. Two candidate runs also wrote their PNGs into the Flask checkout because the recipe never says where a picture goes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The routing table in SKILL.md sends a request for a new board of parts, however its subject is phrased, to the architecture recipe, and the sequence recipe is read for the exchange on top of it, not instead of it
- [x] #2 The architecture recipe says that a board whose full picture no reader can follow gets a view per reading, and that a request path on the board is a flow and a view, not a row to declare inapplicable
- [x] #3 The create recipes say a picture is written where the request names or beside the answer, never into the repository being described
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. SKILL.md routing table: split the first row into 'a new board of parts, whatever the subject (how a request travels, what a service is made of)' -> architecture recipe, and note that the sequence recipe is read on top for an exchange the request asks for; sequence row keeps 'explain ... as an ordered exchange'. 2. create-architecture.md step 4: a full picture no reader can follow gets a view per reading; a request path on the board is a flow plus data-flow view, not inapplicable; pictures written beside the answer or where the request names them, never into the checkout. 3. create-sequence.md rasterize line: same picture-location line. 4. sync skills.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Routing table: new-board row names 'how a request travels' explicitly; sequence row says on a new or existing board; a paragraph says a new board is the architecture recipe first and the sequence recipe on top only when the exchange is asked for. create-architecture step 4: a board nobody can follow whole gets a view per reading, a request path is a flow through a data-flow view, pictures drawn to look at go in a temporary directory. create-sequence step 3 carries the picture line. Verified by reading the rendered files; fmt:check clean; skills synced.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Routed a new board of any subject to the architecture recipe, told authors a tangle is answered by views and a request path by a flow, and said where a picture goes; verified by fmt:check and the synced skills.
<!-- SECTION:FINAL_SUMMARY:END -->

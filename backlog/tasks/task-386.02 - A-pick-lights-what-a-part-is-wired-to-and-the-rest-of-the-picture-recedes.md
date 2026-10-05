---
id: TASK-386.02
title: 'A pick lights what a part is wired to, and the rest of the picture recedes'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-03 15:14'
updated_date: '2026-10-03 16:05'
labels:
  - frontend
dependencies: []
parent_task_id: TASK-386
priority: high
type: enhancement
ordinal: 672000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Picking a part draws a ring around it and nothing else. On Archboard server a reader cannot tell which of the 52 lines belong to the part they picked, so the picture does not answer the first question an architect asks of a part: what does it talk to, and what talks to it? The board already says so, because every relationship has a source and a target. A presented walkthrough step already makes what it is not about recede (the veil, with is-lit marks on what stays). A pick and the pointer at rest can use the same marks to light the connections of a part.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 While a part is picked, the relationships that start or end at it and the parts at their other ends are drawn at full strength, and everything else recedes
- [x] #2 Resting the pointer on a part lights its connections the same way, more lightly, and moving away returns to the connections of the pick, or to rest
- [x] #3 A relationship that lights is drawn on from its source to its target, so its direction reads at a glance
- [x] #4 Escape, or a click on the background, lets go of the pick and the lighting
- [x] #5 A presented walkthrough step keeps its own veil, and lighting does not apply while a step is presented
- [x] #6 With reduced motion the lighting changes at once, with no draw-on
- [x] #7 Lighting adds and removes classes on the picture and does not rewrite its markup
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Pure reading in lib/connections.ts: for a node, its subtree (the node and what it contains), the relationships that cross the subtree's edge (calls leave it, called-by arrive at it), those inside it, and the parts at their other ends; for a relationship, itself and its two ends. The lit set is ids only.
2. use-lighting.ts decides what is lit: the part the pointer rests on for a moment (hover, lighter), else the pick. A move to another part while lit is at once; leaving waits a short grace so crossing a gap between two cards does not flash. It stands down while a walkthrough step is presented, a group is selected, or the picture is leaving, and when the part has no drawn relationship.
3. The lit set goes through the existing veil marks (markVeil: is-lit on subjects, their traffic, the group regions and junctions that hold them). The surface gains is-probing, and is-probing-light for a hover. app.css recedes what is not lit with a filter opacity transition, as the presented-step veil does, so it multiplies with the ghosted subjects' own opacity and with a flight's inline writes.
4. A sweep draws each lit relationship on from its source to its target when the lighting changes: a transient copy of the line, animated by dash offset on the document timeline, removed when it ends. Not under reduced motion.
5. Tests: connections.test.ts for the reading (container, inside, crossing, edge, unknown); stage tests for the pick lighting, the hover dwell and grace on a stepped clock, standing down, and no lighting for a part with no drawn relationship.
6. Board proposal: Board viewer@TASK-386.02.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured in headless Chromium at 1920x1080 on Archboard server (dev page on Vite 5192, real server on 3000, software compositing, which overstates raster): a click on Board write routes lights 32 of the picture's groups (the part, its 7 relationships with their labels, the 7 parts at their other ends and the group regions that hold them) and recedes the rest; 7 sweeps appear within 60 ms and are gone by 1.2 s; the light stays until a click on the empty picture, which clears it. A trace of the click shows 115 ms of main thread work over 900 ms, one task of 36 ms (the click itself: marks, class, style recalc) and 29.5 ms of paint for the whole 160 ms recede, with no frame loop afterwards.
Decisions. The recede is a filter opacity on the picture's own subjects, as the presented-step veil is, so it multiplies with a ghosted subject's own opacity and with a flight's writes; plain opacity would be overridden by both. The light reuses the veil's marks (is-lit, the group regions and junctions by members) and adds is-probing, so no second marking path exists. A walkthrough being presented stands the light down, not only a step's veil: the first step of a walkthrough may veil nothing. The lit set includes the containers that hold lit parts, so a lit card is never seen inside a frame that has receded. lib/connections.ts already held the reading of what a part sends to and receives from (DetailsPanel), so litBy lives beside connectionsOf and shares its subtree.
Validation: connections and lighting are held by tests/semantic-board-lighting.test.tsx (the lit sets of a part, a container, a relationship; pick, hover with dwell and grace on a stepped clock, hover over a pick, a part with nothing drawn, the sweep and reduced motion) and by the narrative test (no light while a walkthrough is presented). bun test over src/ui passes except the 10 drill-down tests that fail on HEAD and two (pane-news, navigator-tree) that also fail on a clean checkout of HEAD. Type-check and lint are clean for the touched files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A pick or a resting pointer now makes the picture answer: the part, everything it holds, every relationship that touches any of it, the parts at their other ends and their containers stay as drawn, the rest recedes under a filter opacity, and each lit relationship is drawn on once from its source to its target. A resting pointer lights more lightly after 110 ms, and gives the pick back when it leaves. A presented walkthrough, a selected group or a leaving picture stands the light down; reduced motion gets the light at once and no sweep. Verified by 9 lighting tests, the narrative test, headless Chromium probes and a trace on the densest board. Board proposal Board viewer@TASK-386.02 adopted.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: TASK-386.02
title: 'A pick lights what a part is wired to, and the rest of the picture recedes'
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-03 15:14'
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
- [ ] #1 While a part is picked, the relationships that start or end at it and the parts at their other ends are drawn at full strength, and everything else recedes
- [ ] #2 Resting the pointer on a part lights its connections the same way, more lightly, and moving away returns to the connections of the pick, or to rest
- [ ] #3 A relationship that lights is drawn on from its source to its target, so its direction reads at a glance
- [ ] #4 Escape, or a click on the background, lets go of the pick and the lighting
- [ ] #5 A presented walkthrough step keeps its own veil, and lighting does not apply while a step is presented
- [ ] #6 With reduced motion the lighting changes at once, with no draw-on
- [ ] #7 Lighting adds and removes classes on the picture and does not rewrite its markup
<!-- AC:END -->

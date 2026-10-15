---
id: TASK-474
title: >-
  A container's header reads as the ground it is cut into, and a far card's chip
  stands at its top
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-15 11:32'
updated_date: '2026-10-15 11:41'
labels: []
dependencies: []
ordinal: 816000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner reviewed the picture on 2026-10-15 and named two faults. A container's header slab is painted as a card is: a card's face, front edge and shadow, tinted by the group that places the container (ADR 0044, decision 5). So the head of a well reads as one more card. And from far away a card's kind chip grows to a tile centred down the card, while near it stands at the top left. On a tall card the chip jumps to the middle when the picture is seen from far away.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A container's header face, and a sequence frame's, is the colour of the surface its well is cut into in both themes: the ground at the top level, and the floor of the container around it when it is nested. A group no longer tints it.
- [ ] #2 The header's front edge is its face in shade, darker than the face in both themes, and the header keeps its ports, its chip and its standing border.
- [ ] #3 From far away a card's chip, and a container header's, stands at the top of its face as it does near, and the far words start level with it.
- [ ] #4 DESIGN.md, the notes in theme.css, the renderer's comments and an amendment to ADR 0044 say what the picture now draws.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Board affected: Semantic renderer. Proposal Semantic renderer@TASK-474 restates Tray surfaces (zPI3vU4A: the header slab is made of what the well is cut into, no group tint) and Near and far content (8jYL9wH6: the far tile stands at the top of the face). No other board draws the header colour or the far chip.
2. appearance.ts: trayLook takes the tray's depth and paints the header face with the ground (the page at depth 0, the parent tray's floor when nested) and its front edge in that ground's shade. measured-cards.ts and dataflow.ts pass the depth. semantic-appearance.ts gives a drawn container no group body colour; the group region still shows membership.
3. far-card.ts: the far tile and the far words start at the top of the face instead of halfway down.
4. Tests: grouping.test.ts holds the header face to --background, the edge darker than the face, and a nested header to its parent floor; far-view-swap.test.ts holds a tall card's far tile at or above its near chip.
5. Docs: DESIGN.md, theme.css notes, frontend.md theme notes, tray.ts and far-card.ts comments, amendments to ADR 0044 and ADR 0042.
6. Close: bun run check, code check against the proposal, footprint, adopt, dogfood check.
<!-- SECTION:PLAN:END -->

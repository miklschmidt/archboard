---
id: TASK-474
title: >-
  A container's header reads as the ground it is cut into, and a far card's chip
  stands at its top
status: Done
assignee:
  - '@claude'
created_date: '2026-10-15 11:32'
updated_date: '2026-10-15 14:50'
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
- [x] #1 A container's header face, and a sequence frame's, is the colour of the surface its well is cut into in both themes: the ground at the top level, and the floor of the container around it when it is nested. A group no longer tints it.
- [x] #2 The header's front edge is its face in shade, darker than the face in both themes, and the header keeps its ports, its chip and its standing border.
- [x] #3 From far away a card's chip, and a container header's, stands at the top of its face as it does near, and the far words start level with it.
- [x] #4 DESIGN.md, the notes in theme.css, the renderer's comments and an amendment to ADR 0044 say what the picture now draws.
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The close ran on the branch after its rebase onto main 8bbb63584. The task's code is 87e972d61, and d30de258c gave the proposal the board's scope as its summary.

Code check: archboard check --code with --variant TASK-474 and without it list the same 21 findings, so the proposal adds and clears none. The one finding on this board, EXPOSED_UNUSED on Renderer core, is in both runs, and 87e972d61 adds no export.

Footprint against base 8bbb63584, the commit before 87e972d61, which is the first commit with Refs: TASK-474. Current is TASK-468, the parent of the proposal. Named and changed: Tray surfaces and Near and far content. Changed but not named: Bun host (src/runtime/semantic-renderer) changed only in its tests grouping.test.ts and far-view-swap.test.ts. Sequence painter (dataflow.ts) and Measured card painter (measured-cards.ts) only pass the header box to trayLook in place of a card look, so no relationship of theirs changes. Renderer core is the directory container. Inside it, only appearance.ts and semantic-appearance.ts changed without a part of their own, and the restated Tray surfaces says what they now paint. Named but not changed: none. The 12 other commits in the range were d30de258c and the commits of TASK-475, and none of them changed a part of this board.

Looked at on the rebased build at 1920x1080, on Semantic renderer: the Renderer core header is the page's ground with a shaded front edge, and it keeps its chip, its standing border and its port. From far away, each card's chip stands at the top of its face, with the name level with it.

Gate: bun run check passed in full on 6aa9accce, with both proposals adopted (lint, format, types, 4714 module tests with 1 skipped, 240 system tests, 27 repository tests, 19 browser files). wide-boards.test.ts, the one test that lays out the dogfood boards, read the adopted boards there.

Adopted Semantic renderer@TASK-474 at version 52, and archboard check reports no diagnostics. Behind: of the boards that 87e972d61 puts behind, only Renderer layout is not adopted here. It reads behind through Renderer core, which is bound to the whole src/transformers/semantic-renderer directory. That board draws how a drawing is settled and measured, and 87e972d61 changed only paint code, so it stays true. Its one finding, EXPOSED_UNUSED on Renderer core, was there before the task.

README: bun run readme:check lists all 16 assets as stale, and a checkout of main 8bbb63584 lists the same 16, so this task made none of them stale.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A container's header, and a sequence frame's, is now made of the ground its well is cut into: the page at the top level and the floor of the container around it when nested, with no group tint, and a front edge that is its face in shade. From far away a card's chip and a container header's stand at the top of the face, as they do near, and the far words start level with them. Verified by grouping.test.ts in both themes (the face is --background, the edge is darker, and a nested face is the parent floor) and far-view-swap.test.ts (the far tile is at or above the near chip), in a full bun run check on the branch rebased onto main, and on the rebased build in a browser, near and far. DESIGN.md, the theme.css notes, frontend.md, the renderer comments and amendments to ADR 0044 and ADR 0042 describe it. Semantic renderer@TASK-474 is adopted.
<!-- SECTION:FINAL_SUMMARY:END -->

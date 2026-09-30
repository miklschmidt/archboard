---
id: TASK-237
title: >-
  A backward relationship ending on a container crashes the layout when a
  predecessor supplies its faces
status: Done
assignee: []
created_date: '2026-09-15 19:54'
updated_date: '2026-09-16 09:57'
labels:
  - renderer
dependencies: []
references:
  - src/runtime/semantic-renderer/lib/layout/compound-graph.ts
  - TASK-236
type: bug
ordinal: 408000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while drawing flow steps on the board (TASK-236): a relationship from a leaf to a container that holds children, running against the ranks (a return), renders alone but crashes ELK with "undefined is not an object (evaluating nodeOrder[l][0].layer)" when the same content is rendered as a proposal with the previous drawing as predecessor, so previousSides inherits its faces. Repro: nodes Canvas server (container of Board store and Renderer), Vault, Pane; edges Board store -> Vault, Pane -> Canvas server, Renderer -> Board store; add an edge Vault -> Canvas server (or Canvas server -> Pane) and render with predecessors set to the same content. Step lines now avoid containers, so this is reachable only through an authored relationship to a container, which the receiver rule discourages but the product accepts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The repro renders as a proposal without throwing, and a renderer test holds it
- [x] #2 The inherited faces of a backward relationship ending on a container are the faces the current reading would choose, or the engine is given ports it accepts
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed under TASK-245.04: a relationship between a frame and a card outside it now gets no fixed face, inherited or from ranks; the engine attaches it node to node, which it accepts under the interactive strategies. The reproduction needed a proposal that forces a solve (an added card); with the same content as predecessor the renderer reuses the old geometry. Held by src/runtime/semantic-renderer/tests/frame-relationships.test.ts in both directions.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A frame's relationship with a card outside it no longer crashes a proposal's layout: it gets no fixed face and the engine attaches it. Verified with frame-relationships.test.ts (frame to card and card to frame, under a predecessor) and the renderer suite.
<!-- SECTION:FINAL_SUMMARY:END -->

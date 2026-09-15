---
id: TASK-237
title: >-
  A backward relationship ending on a container crashes the layout when a
  predecessor supplies its faces
status: To Do
assignee: []
created_date: '2026-09-15 19:54'
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
- [ ] #1 The repro renders as a proposal without throwing, and a renderer test holds it
- [ ] #2 The inherited faces of a backward relationship ending on a container are the faces the current reading would choose, or the engine is given ports it accepts
<!-- AC:END -->

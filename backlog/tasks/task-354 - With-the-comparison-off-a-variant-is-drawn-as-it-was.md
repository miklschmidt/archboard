---
id: TASK-354
title: 'With the comparison off, a variant is drawn as it was'
status: To Do
assignee: []
created_date: '2026-09-28 02:12'
labels:
  - renderer
dependencies: []
priority: medium
type: bug
ordinal: 595000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found 2026-09-28 while filming README footage. In the browser, turning off Show comparison on canvas on the historical variant Monolith of the example Web shop board draws its Shop app card as a large, empty container. Monolith gives Shop app no children; the current variant gave the same node id children (it became Checkout API). The frame appears to come from the comparison with the current variant, so the historical state is not drawn as it was. Archboard's own Renderer layout board, whose history has no containers, draws its historical states correctly with the comparison off.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With the comparison off, a node that has no children on the variant shown is drawn as a card, whatever it contains on the current variant
- [ ] #2 With the comparison on, the comparison picture is unchanged
<!-- AC:END -->

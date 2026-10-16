---
id: TASK-485
title: 'A view with nothing to draw on a variant says so, not that the board is empty'
status: To Do
assignee: []
created_date: '2026-10-16 12:59'
labels:
  - renderer
  - cli
dependencies: []
priority: low
type: bug
ordinal: 850000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Shared views often name flows or parts that only some variants hold. Rasterizing such a view on a variant that holds none of them fails with 'Semantic board "Endpoint Gateway" has nothing on it yet, so there is nothing to draw', which is false: the board has content, only this view of this variant draws nothing. Agents fixing the Docs-Architecture-Design boards on 2026-10-16 read the message as a broken board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Rendering or rasterizing a view that draws nothing on the chosen variant names the view and the variant and says the view has nothing on that variant
- [ ] #2 A board with no content at all keeps its own message
<!-- AC:END -->

---
id: TASK-239
title: Give a hub one trunk per face so the engine can bundle its departures
status: To Do
assignee: []
created_date: '2026-09-15 21:27'
updated_date: '2026-09-15 21:59'
labels:
  - renderer
dependencies:
  - TASK-231
references:
  - docs/design/layout-rules.md
ordinal: 410000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ELK merges edges only when they share a port, and every relationship here owns its own port, so mergeEdges measured as a no-op. A card with many forward relationships could leave by one shared port per face so the router bundles the departures into a trunk that fans out between rows. Try after TASK-231 on board 3 (WSGI application) of the wide-board fixtures.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 On board 3, the hub departures share a trunk and bends per edge stay within 10% of the TASK-231 result
- [ ] #2 Lane nesting for same-destination routes is unchanged
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured 2026-09-15: mergeEdges is still a no-op with node-to-node attachment. A shared SOUTH port for every hub skip: boards 1 and 2 to 4.61/5.14 Mpx with bends 5.9/6.4, board 3 to 7.27 Mpx (+63%) with cells touched 17%; six routes through one port take the width back. Not adopted; docs/design/layout-rules.md section 8.
<!-- SECTION:NOTES:END -->

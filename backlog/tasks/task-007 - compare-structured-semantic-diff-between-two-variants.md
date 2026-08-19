---
id: TASK-007
title: 'compare: structured semantic diff between two variants'
status: To Do
assignee: []
created_date: '2026-08-19 14:50'
updated_date: '2026-08-19 14:50'
labels:
  - needs-triage
dependencies:
  - TASK-003
ordinal: 7000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Returns structured output only; prose is the agent's job, never the tool's
- [ ] #2 Diff is keyed on node identity, not element ids or geometry
- [ ] #3 Reports semantic operations (node added, edge removed, binding changed), not coordinate deltas
- [ ] #4 Output is small enough to narrate inside the 1000-token voice budget
<!-- AC:END -->

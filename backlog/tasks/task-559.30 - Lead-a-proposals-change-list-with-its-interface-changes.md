---
id: TASK-559.30
title: Lead a proposal's change list with its interface changes
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T04:17:00Z'
updated_date: '2026-10-31T04:58:00Z'
labels:
  - frontend
dependencies:
  - TASK-559.23
  - TASK-559.27
parent_task_id: TASK-559
priority: medium
ordinal: 1002000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0044:220 says that a comparison states interface changes first, because they cost every caller. The Changes tab does not. Audit rank 6. compareInterfaces holds the answer and TASK-559.27 brings it back to the comparison read.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The Changes tab states interface changes first
- [ ] #2 A row selects the changed module on the picture
- [ ] #3 A comparison with no interface change says so
<!-- AC:END -->

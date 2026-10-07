---
id: TASK-436.11
title: Each text line of check --code shows its finding code
status: To Do
assignee: []
created_date: '2026-10-07 00:36'
labels:
  - cli
dependencies: []
parent_task_id: TASK-436
ordinal: 705000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Each text line of `check --code` shows the severity, the file, the subject and the message, but not the finding code, such as `RELATIONSHIP_UNDRAWN`. The archboard-dev skill reads the codes from the JSON with `jq`, which no document lists as a requirement.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each text line of `check --code` shows its finding code
- [ ] #2 The archboard-dev skill compares the findings with and without `--variant` without `jq`
<!-- AC:END -->

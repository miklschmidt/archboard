---
id: TASK-529.08
title: Interface width is a recorded rule and a repository check
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T01:27:00Z'
labels: []
dependencies: []
parent_task_id: TASK-529
type: task
ordinal: 949000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-500.14 measured subpaths and kept every name callers imported, so nothing stopped interfaces from growing by demand.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An ADR replaces the export-what-callers-import rule with operations a caller needs, measured by what the caller must learn
- [ ] #2 docs/agents/boundaries.md states the rule
- [ ] #3 A repository-policy check fails when a package exports more names than its recorded ceiling
<!-- AC:END -->

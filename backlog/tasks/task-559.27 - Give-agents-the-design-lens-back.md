---
id: TASK-559.27
title: Give agents the design lens back
status: To Do
assignee: []
created_date: '2026-10-31T04:16:00Z'
updated_date: '2026-10-31T04:17:00Z'
labels:
  - cli
  - skills
dependencies: []
parent_task_id: TASK-559
priority: high
ordinal: 999000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The audit of TASK-549 (docs/design/task-549-reader-audit.md, ranks 5, 6 and 8 for the CLI) found that PR 19 removed semantic inspect, interface changes in a comparison, and the measures of competing proposals, with no decision, and that the consumer skill no longer names the lenses. An agent cannot read a module's interface today. Purpose: easy identification of codebase smells through A Philosophy of Software Design.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard model inspect states one module's interface: entry points with what reaches them, hidden parts by name, callers, outgoing relationships, pass-through entry points, and relationships that end on the module itself
- [ ] #2 archboard model inspect reads the boundary of a group
- [ ] #3 archboard model compare states interface changes first, from compareInterfaces
- [ ] #4 archboard model compare states the measures of each compared proposal side by side, as counts with no combined score
- [ ] #5 The consumer skill teaches model inspect, model locality and model footprint, and archboard-dev names them
- [ ] #6 One derivation serves the reader and the CLI
<!-- AC:END -->

---
id: TASK-482.04
title: Every crowded dogfood board gets inner structure and its calls move into flows
status: To Do
assignee: []
created_date: '2026-10-15 21:05'
updated_date: '2026-10-15 21:51'
labels:
  - skill
dependencies:
  - TASK-482.03
documentation:
  - docs/adr/0052-a-board-opens-on-its-overview.md
parent_task_id: TASK-482
priority: medium
type: task
ordinal: 845000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the Live panes pilot of ADR 0052, the other dogfood boards over the overview budget need the same change. On 2026-10-15 they were Board viewer, Archboard server routes, Board persistence, Agent workbench, Command interface, Browser application, Archboard server, Semantic renderer, Board rasterizer, Skill evaluation, Voice coordinator and Codex workhorse.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `archboard check` reports no `OVERVIEW_CROWDED` for any dogfood board
- [ ] #2 Every new container has a responsibility that the code supports, and binds to a folder where the code has one
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
On 2026-10-15 the first `archboard check` with OVERVIEW_CROWDED also flagged Renderer layout (17 parts, 20 lines) and lists Codex workhorse at exactly 15 parts with 34 lines: 13 boards besides Live panes.
<!-- SECTION:NOTES:END -->

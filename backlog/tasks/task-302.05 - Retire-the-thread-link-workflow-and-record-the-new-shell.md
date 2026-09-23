---
id: TASK-302.05
title: Retire the thread-link workflow and record the new shell
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-23 03:21'
labels: []
dependencies:
  - TASK-302.03
  - TASK-302.04
parent_task_id: TASK-302
priority: high
ordinal: 527000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Once the agent bar and navigator ship, the thread-link chooser, the Agent settings dialog, the session column, the side-panel tabs and the orphan modules have no purpose, and the docs and ADRs still describe the old workflow (ADR 0019 requires the person to create a link; operator-canvas-shell.md shows a bottom workbench; the voice acceptance procedure names a Start agent button).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No production code or test references the removed thread-link, agent-settings, session-column or side-panel UI, and unused UI modules are deleted
- [ ] #2 ADR 0019 records that the first send or Talk creates the workhorse and that the conversation follows the pane holding it
- [ ] #3 docs/design/operator-canvas-shell.md, CONTEXT.md, TESTING.md and the voice acceptance procedure describe the shipped shell
- [ ] #4 The browser lane owners assert the new behaviour through roles, geometry and wire commands, not copy
<!-- AC:END -->

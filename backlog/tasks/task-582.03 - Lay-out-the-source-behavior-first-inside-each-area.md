---
id: TASK-582.03
title: Lay out the source behavior first inside each area
status: To Do
assignee: []
created_date: '2026-11-06T15:14:00Z'
labels:
  - architecture
dependencies: []
parent_task_id: TASK-582
priority: medium
ordinal: 1026000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/agents/boundaries.md puts role folders first (`ui/clients/pane-session`, `ui/rules/pane-session`, `ui/hooks/pane-session`), so no directory holds one behavior, and its container cannot own its code. The owner decided that behavior first inside each area (`shared`, `runtime`, `server`, `ui`) is the right structure. Areas stay, because they separate where code runs and lint rules depend on them. Lint rules that read a role folder today must move to a form that survives inside a behavior folder. Planned as its own initiative, not done in the PR that adds the warning.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/agents/boundaries.md and tests/system/repository-policy/workspace-layout.test.ts state the behavior-first layout before any code moves
- [ ] #2 Every lint or policy rule that reads a role folder keeps its guarantee in the new layout
- [ ] #3 Each container that the containment warning names is repaired: a model error by a model change, a layout split by moving the code
- [ ] #4 archboard check on this repository reports no containment warning
<!-- AC:END -->

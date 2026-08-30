---
id: TASK-143.03.08
title: Disclose coordinator identity and settings
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.03.02
  - TASK-143.03.04
  - TASK-143.07.01
  - TASK-144.07
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-coordinator
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 205000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Disclose coordinator identity and configured/effective model, effort, service tier, approval, and sandbox settings without presenting it as the workhorse. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Settings distinguish loading, saving, matching notification confirmed, refused, stale coordinator, lost/outcome_unknown, reconciled, unavailable model/effort/tier, and fallback where priority is not advertised.
- [ ] #2 A save remains pending until the exact settings-updated notification proves model, effort, and effective service tier while approval and sandbox remain unchanged.
- [ ] #3 Failed/uncertain saves restore or freeze the edited values until a full authoritative read reconciles; no optimistic coordinator configuration becomes truth.
- [ ] #4 Workhorse and coordinator identity/history/settings are labelled distinctly for visual and screen-reader users and never share a thread-link control.
<!-- AC:END -->

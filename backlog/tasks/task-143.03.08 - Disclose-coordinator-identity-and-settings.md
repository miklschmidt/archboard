---
id: TASK-143.03.08
title: Disclose coordinator identity and settings
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 17:51'
labels: []
dependencies:
  - TASK-143.03.02
  - TASK-143.03.04
  - TASK-143.07.01
  - TASK-144.20
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
Render read-only coordinator identity and host-selected configured/effective model, effort, service tier, approval, and sandbox settings without presenting it as the workhorse. This surface has no edit or save command. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The read-only disclosure distinguishes loading, confirmed, stale coordinator, unavailable, and fallback when priority is not advertised; it has no saving, refused-save, or outcome_unknown edit state.
- [ ] #2 It displays configured model gpt-5.6-luna, configured reasoning effort medium, effective service tier, approvalPolicy, approvalsReviewer, sandboxPolicy, and activePermissionProfile from authoritative host state.
- [ ] #3 The module exposes no form fields, save control, browser command, settings/update call, or optimistic settings state; unavailable fields name the missing host fact and recovery.
- [ ] #4 Workhorse and coordinator identity, history, and settings are labelled distinctly for visual and screen-reader users and never share a thread-link control.
<!-- AC:END -->

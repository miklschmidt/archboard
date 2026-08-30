---
id: TASK-143.07.03
title: Execute four bound workhorse operations
status: To Do
assignee: []
created_date: '2026-08-30 15:08'
labels: []
dependencies:
  - TASK-143.01.09
  - TASK-143.06.01
  - TASK-143.07.02
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-workhorse-operations
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 194000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own inspect, delegate, queue-management, and conditional steer effects in `src/runtime/codex-workhorse-operations`. Caller-selected targets are impossible because the host injects the linked workhorse identity.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Inspect is read-only; idle delegation starts a turn with exact Archboard additionalContext; busy created work may queue; busy attached work accepts only a related correction through steer with exact context and expectedTurnId.
- [ ] #2 Unrelated attached-busy work is refused with an actionable wait-until-idle result; prior-epoch, cross-domain, self-target, unavailable, or mismatched-manifest targets fail closed.
- [ ] #3 Explicit corrections, Coordinator judgment, and Never steer are enforced exactly and every effect has stable cross-timeline correlation.
- [ ] #4 Tests cover idle/active/attached/created branches, one bounded direct board action remaining coordinator-owned, and cancellation before/after dispatch.
<!-- AC:END -->

---
id: TASK-143.04.05
title: Present voice-specific spoken approval state
status: To Do
assignee: []
created_date: '2026-08-30 15:10'
updated_date: '2026-08-30 15:42'
labels: []
dependencies:
  - TASK-143.03.07
  - TASK-143.04.01
  - TASK-143.07.05
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/voice-spoken-approval
parent_task_id: TASK-143.04
priority: high
type: task
ordinal: 213000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own active-voice eligibility, speech/session correlation, race disclosure, and spoken-resolution status in `src/ui/voice-spoken-approval`. Ordinary reusable approval cards remain owned by TASK-143.03.07.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The view renders none, presenting, awaiting_user, resolving, accepted, declined, expired, visually-resolved, ambiguous, replaced-session, fallback-required, outcome_unknown, and failed states from the spoken gate and broker record.
- [ ] #2 It repeats the exact stored effect and one-time choices, names coordinator-model judgment as part of the boundary, and routes visual fallback through the ordinary approval card.
- [ ] #3 No control classifies speech or executes an effect; ordinary visual choice and later coordinator verdict compete through the same broker identity/CAS.
- [ ] #4 Tests at src/ui/voice-approval/tests cover every state/race, labels/status, keyboard focus, no color-only semantics, both themes, early/duplicate reply, and fallback reachability.
<!-- AC:END -->

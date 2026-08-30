---
id: TASK-143.04.05
title: Present voice-specific spoken approval state
status: To Do
assignee: []
created_date: '2026-08-30 15:10'
labels: []
dependencies:
  - TASK-143.03.07
  - TASK-143.07.05
  - TASK-143.04.01
  - TASK-144
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
- [ ] #1 The view shows approvalId, exact stored description, requesting identity variant, one-time accept/decline, normal coordinator classifier, and the accepted uncorrelated-speech race.
- [ ] #2 Presenting, awaiting user, resolving, accepted, declined, expired, cancelled, invalidated, coordinator-blocked visual fallback, and second-slot refusal are distinct.
- [ ] #3 Only coordinator-free eligible requests enter the voice path; blocking requests, session grants, policy amendments, stale sessions, and visual resolution stay or become visual-only.
- [ ] #4 Browser tests cover exact description sequencing, every compare-and-swap expiry race, duplicate/early/ambiguous replies, and screen-reader/focus behavior.
<!-- AC:END -->

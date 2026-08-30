---
id: TASK-143.03.05
title: Control workhorse turns from the composer
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 17:51'
labels: []
dependencies:
  - TASK-143.03.02
  - TASK-143.03.03
  - TASK-144.20
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-composer
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 202000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own text composer submit/steer/interrupt behavior against the authoritative workhorse runtime. This leaf alone may directly import the reviewed assistant-ui composer primitives; it copies no Elements. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The module's only assistant-ui import is named root ComposerPrimitive; submit, steer, interrupt, draft, pending, and focus behavior remain Archboard-owned and target the captured current thread link/turn.
- [ ] #2 Idle submit uses the literal turn/start body, active steer uses the literal turn/steer body with host-proven expectedTurnId, and interrupt targets the captured active turn; link/state changes before dispatch refuse.
- [ ] #3 Composer disables during pending command lease, preserves or clears draft by documented delivered/not_delivered/outcome_unknown outcome, and never creates an optimistic assistant record.
- [ ] #4 Keyboard, multiline, IME, screen-reader label, focus restoration, stale link, disconnect, late result, duplicate activation, and active-turn races are covered by module tests.
<!-- AC:END -->

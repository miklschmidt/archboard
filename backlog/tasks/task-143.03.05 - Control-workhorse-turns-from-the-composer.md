---
id: TASK-143.03.05
title: Control workhorse turns from the composer
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 16:58'
labels: []
dependencies:
  - TASK-143.03.02
  - TASK-143.03.03
  - TASK-144.07
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
- [ ] #1 Submit creates authoritative command/turn identity; active input steers only with exact expectedTurnId and Stop interrupts only the bound current turn.
- [ ] #2 Only reviewed composer primitives are imported from assistant-ui. No assistant transport, queue/tool handler, setMessages, edit/reload/delete control, voice adapter, or copied Elements enter this module.
- [ ] #3 Draft freezes while pending; refused/not_delivered/outcome_unknown restores it and blocks duplicate submit until authoritative reconciliation, while delivered clears only after matching events.
- [ ] #4 Keyboard/newline/IME/paste limits, status, focus return, reconnect, late result, stale link, child exit, and turn replacement are deterministic.
<!-- AC:END -->

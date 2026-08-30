---
id: TASK-143.03.05
title: Control workhorse turns from the composer
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 16:29'
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
Own text composer submit/steer/interrupt behavior against the authoritative workhorse runtime. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Submit creates the authoritative client command and turn-keyed assistant record immediately; an active turn uses steer only with its exact expectedTurnId, and Stop interrupts only the bound current turn.
- [ ] #2 The draft is frozen while delivery is pending; refused, not_delivered, or outcome_unknown restores the exact draft and disables a duplicate submit until authoritative reconciliation states whether a turn exists.
- [ ] #3 Delivered clears the draft only after the matching authoritative turn/item event; reconnect, late result, stale link, child exit, and turn replacement reconcile without duplicate user messages.
- [ ] #4 Keyboard submit/newline, IME composition, paste limits, accessible status, and focus return are deterministic and tested through the runtime public interface.
<!-- AC:END -->

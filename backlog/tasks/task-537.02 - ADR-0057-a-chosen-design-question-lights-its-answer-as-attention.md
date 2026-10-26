---
id: TASK-537.02
title: 'ADR 0057: a chosen design question lights its answer as attention'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T17:03:00Z'
updated_date: '2026-10-26T00:56:00Z'
labels:
  - design-questions
dependencies: []
parent_task_id: TASK-537
type: docs
ordinal: 929000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0045 says that the pane inspector is the one place where a reading shows. ADR 0044 says that a pass-through entry point has no mark of its own in the picture. The owner decided on 2026-10-25 that a chosen design question lights its answer, as Trace does. That decision narrows both clauses, so it needs an ADR.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ADR 0057 states that a chosen design question leaves its answer lit and recedes the rest, and that this is attention, not a mark or a colour
- [x] #2 It amends the clause of ADR 0045 that the inspector is the one place a reading shows, and the pass-through clause of ADR 0044, and the head of each amended ADR points to it
- [x] #3 It keeps these rules: history sets no traffic, colour or mark, history never runs on a timer, a pane never starts a code pass, and no question gives a score, a combined number or a verdict
- [x] #4 CONTEXT.md defines Design question, and its Light entry says that a chosen design question can take the place of a pick
- [x] #5 The owner accepts the ADR
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ADR 0057 is written with status proposed. It waits for the owner to accept it (criterion 5). ADR 0044 and ADR 0045 point to it at their heads and at the clauses it narrows. CONTEXT.md defines Design question, and the Light entry names a chosen design question.

The owner accepted ADR 0057 on 2026-10-26 and left the limit on how far out a step frames to the implementer. The ADR now has status accepted, and its decision states the limit: a step frames the nearest parts first, at half the drawn size or closer (TASK-537.03).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ADR 0057 records that a design question's answer is read one step at a time: each result lights the whole answer, rings its subject and brings it in with its nearest relationship ends at a size cards read. It amends ADR 0044 (a pass-through entry point can be lit) and ADR 0045 (a chosen question can light what a reading names), and keeps the rules on history, timers, code passes and verdicts. CONTEXT.md defines Design question and the Light entry names it. The owner accepted it on 2026-10-26.
<!-- SECTION:FINAL_SUMMARY:END -->

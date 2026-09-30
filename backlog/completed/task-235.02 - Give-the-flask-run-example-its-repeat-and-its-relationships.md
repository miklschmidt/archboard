---
id: TASK-235.02
title: Give the flask run example its repeat and its relationships
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 18:51'
updated_date: '2026-09-15 19:07'
labels: []
dependencies: []
references:
  - skills/archboard/SKILL.md
  - .skill-evals/2026-09-15T13-56-41-652Z/runs/candidate/S07
parent_task_id: TASK-235
ordinal: 397000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
All six S07 runs missed flow.repeat and all three candidate S07 boards (plus one candidate S00 board) carried a flow but no edges, so the board itself renders as disconnected cards. The candidate skill prose says two default module names is repeat: 2, but its own flask run example two lines later shows that ScriptInfo self step with a note and no repeat, and the example writes no edges. Authors copy the example over the prose; one candidate run even reported repeats not applicable. cli.py 311-316 in Flask 3.0.0 loops over the fixed tuple (wsgi.py, app.py), so the count is source-supported (TASK-214 AC6 forbids unsupported counts, not supported ones).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The flask run example carries repeat: 2 on the loading step with its evidence line naming the fixed candidate tuple in cli.py
- [x] #2 The example writes the calls of the exchange as edges on the same board, and the sequence section says a flow rides on the relationships of the board it lives on
- [x] #3 The sequence reference agrees with the example on when repeat applies
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add repeat: 2 and the evidence line to the flask run example. 2. Add the calls as edges to the example and a sentence in the sequence section. 3. Align the sequences reference.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The flask run example (now references/create-sequence.md) carries repeat: 2 with the evidence line naming the fixed ("wsgi.py", "app.py") tuple in cli.py, and four call edges; the sequence lead says the flow is drawn only through its view so the calls are edges too; the sequences reference names the literal-list case.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Example and prose agree on repeat: 2 and the example writes relationships; verified by reading the committed reference and the sequences reference.
<!-- SECTION:FINAL_SUMMARY:END -->

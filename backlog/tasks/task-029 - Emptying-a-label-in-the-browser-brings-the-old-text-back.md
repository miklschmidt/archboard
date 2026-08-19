---
id: TASK-029
title: Emptying a label in the browser brings the old text back
status: To Do
assignee: []
created_date: '2026-08-19 22:41'
updated_date: '2026-08-19 22:41'
labels:
  - needs-triage
dependencies: []
ordinal: 29000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Clearing a label in the browser leaves it cleared after a reload
- [ ] #2 An agent setting a label on a shape whose text is not yet expanded is not wiped by the same path
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 22:41
---
Residual left by TASK-028, flagged by that agent. Retyping a label now sticks. Emptying one does not: Excalidraw deletes the bound text element, so the change report carries no text upsert for the correction to attach to, the seed survives on the server, and the old text returns on the next full load.

Same family as TASK-028 but it needs a deletion signal rather than a statement, and the obvious shortcut is unsafe. Clearing a label on the strength of a container upsert alone would wipe a seed an agent has just set on a shape whose text has not been expanded yet, which is exactly the inbound case TASK-024 exists to protect.
---
<!-- COMMENTS:END -->

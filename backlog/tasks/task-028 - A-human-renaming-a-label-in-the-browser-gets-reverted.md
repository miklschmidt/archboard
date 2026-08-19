---
id: TASK-028
title: A human renaming a label in the browser gets reverted
status: To Do
assignee: []
created_date: '2026-08-19 22:11'
updated_date: '2026-08-19 22:11'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 28000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Retyping a label in the browser sticks; the next conversion pass does not rewrite it
- [ ] #2 The stored label follows the bound text when a human edits it
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 22:11
---
Flagged by the TASK-024 agent and worth acting on: the stored label seed is never updated when a human retypes a label in the browser, so the next conversion pass rewrites it back.

Not a regression. The old code did the same thing, but it expanded the stale seed into a duplicate that won, so the symptom was litter rather than a revert. With labels now singular it shows plainly as the board undoing what somebody typed.

That matters more than its size suggests. Renaming a box is one of the most ordinary things a person does at a whiteboard, and the whole premise here is that a human edits the board and the agent reads it back. A rename that silently reverts breaks that in the most visible way possible.
---
<!-- COMMENTS:END -->

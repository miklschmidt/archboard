---
id: TASK-022
title: Region signal reports movement for untouched nodes
status: To Do
assignee: []
created_date: '2026-08-19 20:02'
updated_date: '2026-08-19 20:03'
labels:
  - needs-triage
dependencies: []
ordinal: 22000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Adding a node at the edge of a board does not report region moves for nodes nobody touched
- [ ] #2 Region stays useful for genuine movement
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 20:03
---
Observed while verifying TASK-018: adding Settlement at the right edge of payments expanded the board's node bounding box, so 'Payment Events' and 'Payments DB' both reported region moves despite not being touched. Region is thirds of that board's bounding box, so any node placed outside the current extent reframes everyone.

The primary signal was still correct and useful ('cluster formed: joined by Settlement'), so this is noise rather than a wrong answer, and layout.cannotExpress already discloses that regions are relative to each board's frame. But in the injection path this noise reaches the agent as prose, and 'Payment Events moved' is a false statement about what the human did.

Worth considering: anchor the frame to the shared nodes only, as the cluster signal already does, or suppress region for nodes whose absolute position did not change.
---
<!-- COMMENTS:END -->

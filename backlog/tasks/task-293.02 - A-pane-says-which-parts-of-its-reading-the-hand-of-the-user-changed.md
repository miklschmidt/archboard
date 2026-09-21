---
id: TASK-293.02
title: A pane says which parts of its reading the hand of the user changed
status: To Do
assignee: []
created_date: '2026-09-21 02:08'
labels:
  - voice
  - coordinator
dependencies: []
parent_task_id: TASK-293
priority: high
ordinal: 509000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A pane posts its whole reading as one debounced snapshot (pane-reading.ts, 150 ms) and its focus on its registration; neither says what changed or who caused it, and every kept report publishes the same selection event. The only cause evidence today is presentation.answering, which tells a driven walkthrough step from one chosen by hand. Pane news needs the same for board, variant, view, selection and focus. Only the pane can tell a click from a change that arrived over its socket (pane_present, pane_board, a reload for a new version), and one snapshot can mix the two, so the mark is per part. Deny by default: a part nobody marked is told to nobody, so forgetting a mark produces silence, never the 2026-09-20 feedback loop.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A reading report names which of board, variant, view and selection the user changed by hand since the last report, and a registration says the same of focus
- [ ] #2 A change that reached the pane over its socket or followed a new board version is never marked, including when it shares a report with a change made by hand
- [ ] #3 A driven walkthrough step, whose selection changes with it, marks nothing
- [ ] #4 The wire schema owns the shape, and a report without marks is accepted and means nobody is told
- [ ] #5 A focused owner in the pane proves a click marks and a socket-driven change does not
<!-- AC:END -->

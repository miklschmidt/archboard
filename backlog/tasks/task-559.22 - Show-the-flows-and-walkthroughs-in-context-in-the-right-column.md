---
id: TASK-559.22
title: Show the flows and walkthroughs in context in the right column
status: To Do
assignee: []
created_date: '2026-10-31T03:17:00Z'
updated_date: '2026-10-31T03:52:00Z'
labels:
  - frontend
dependencies: []
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 994000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner found the left Flows and Walkthroughs tabs confusing, because they filter by the open module without saying so, and asked for the right column to show in-context things: the walkthroughs and flows that touch the parts being looked at or selected. Decision: the right column is the context, and the left tabs list the whole model, so a list in the left column never changes under a reader. This fills the empty room between the description and the legend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 With nothing selected, the column lists the flows and walkthroughs that touch the open module
- [ ] #2 With a selection, the same lists follow the selected subjects
- [ ] #3 The left Flows and Walkthroughs tabs list the whole model, whatever is open, and their counts do not change as a reader moves
- [ ] #4 At the root with nothing selected the column lists neither, because everything touches the root and the left tabs already hold it all
- [ ] #5 A row opens its flow or walkthrough, a long list shows a few rows and how many more, and the legend stays fully on screen
- [ ] #6 The owner accepts it by eye
- [ ] #7 With a module open or selected, the column states its interface measures in one short line, the counts of entry points, hidden parts, callers and pass-through entry points, with no combined score, and the line opens that section of About
<!-- AC:END -->

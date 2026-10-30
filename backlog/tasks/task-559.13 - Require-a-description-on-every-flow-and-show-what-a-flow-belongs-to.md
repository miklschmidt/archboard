---
id: TASK-559.13
title: Require a description on every flow and show what a flow belongs to
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-30T20:34:00Z'
labels:
  - frontend
  - model
dependencies: []
parent_task_id: TASK-559
priority: high
ordinal: 985000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner opened the flow One author run under Agent CLI and found nothing that said it belongs to the eval suite. The flow sits in the collection Skill evaluation, but a flow reading never names its collection, and the crumbs suggest that Agent CLI owns it. Only 1 of the 63 flows in this repository has a description. The owner decided that a flow description must be a required field. Retained readings were written before this rule and must stay exact.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A write that creates or changes a flow without a description is refused with an actionable error, through the CLI and the runtime
- [ ] #2 `archboard check` reports a current flow with no description as an error, and every retained reading still opens
- [ ] #3 A flow reading names its collection and shows its description, and the flow list shows which collection each flow belongs to
- [ ] #4 Every flow of this repository has an authored description that the code supports, written through `archboard model`
- [ ] #5 The consumer skill and the design record state the rule
<!-- AC:END -->

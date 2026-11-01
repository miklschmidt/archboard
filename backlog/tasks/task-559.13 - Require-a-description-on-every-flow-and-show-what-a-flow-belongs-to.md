---
id: TASK-559.13
title: Require a description on every flow and show what a flow belongs to
status: Done
assignee:
  - '@claude'
created_date: '2026-10-30T20:34:00Z'
updated_date: '2026-10-30T22:31:00Z'
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
- [x] #1 A write that creates or changes a flow without a description is refused with an actionable error, through the CLI and the runtime
- [x] #2 `archboard check` reports a current flow with no description as an error, and every retained reading still opens
- [x] #3 A flow reading names its collection and shows its description, and the flow list shows which collection each flow belongs to
- [x] #4 Every flow of this repository has an authored description that the code supports, written through `archboard model`
- [x] #5 The consumer skill and the design record state the rule
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merged in 74b8f361a. The repository has 72 flows, not the 63 of the description, and all 72 have a summary. The field stays `summary`. `add-flow` without one fails the request schema with exit 2, and a write that changes a flow and leaves it without one refuses `FLOW_SUMMARY_REQUIRED`. `archboard check semantics` exits 0 on this repository. `archboard check all` exits 1 only on `EMBED_OUTDATED`, which the README embed refresh clears after the content rules. Known limits: drafts keep flows without summaries, `check` covers the current state only, and a lost-response retry of an old `add-flow` now refuses.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A written flow now needs a summary. The CLI and runtime refuse a flow write without one, `archboard check` reports a current flow without one as an error, and retained readings stay tolerant through `RecordedModuleEditSchema`. A flow reading shows its collection and summary, and the flow list groups flows by collection. All 72 flows of this repository have authored summaries. The gate on c68fbb308 passed 21 of 21 tasks in 176 seconds.
<!-- SECTION:FINAL_SUMMARY:END -->

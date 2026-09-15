---
id: TASK-235.11
title: Make the S05 self message a step the source justifies
status: Done
assignee: []
created_date: '2026-09-15 18:52'
updated_date: '2026-09-15 19:07'
labels: []
dependencies: []
references:
  - evals/evals.json
  - evals/fixtures/S05.json
parent_task_id: TASK-235
ordinal: 406000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
S05 flow.message-kinds failed 6/6: the checklist wants a self message for preprocess_request, but authors in both arms modelled preprocess_request as its own participant because it is a distinct method in app.py, and the skill defines self as exactly when both ends are the same node. The one genuinely self step on that path is the request context matching the URL inside its own push (ctx.py RequestContext.push calls self.match_request). Move the expectation there so the feature tests the product semantics instead of a modelling choice.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 S05 expects a self message for the request context matching the URL during push, and no longer demands one for preprocess_request
- [x] #2 The S05 prompt states the fact the exchange includes without naming the mechanism, in line with TASK-229
- [x] #3 bun run eval:skill check passes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
S05 prompt states the push matches the URL; flow.message-kinds expects the self message there and no longer for preprocess_request; eval:skill check ok.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The self message S05 tests is one the source has; verified by eval:skill check.
<!-- SECTION:FINAL_SUMMARY:END -->

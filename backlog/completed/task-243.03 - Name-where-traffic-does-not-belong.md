---
id: TASK-243.03
title: Name where traffic does not belong
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 02:26'
updated_date: '2026-09-16 02:28'
labels: []
dependencies: []
parent_task_id: TASK-243
ordinal: 417000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seven candidate runs in the 2026-09-16 batch drew a grader concern for default traffic on every relationship, including RequestContext.pop (teardown), handle_user_exception (an error path), do_teardown_request, and one-shot startup calls such as `flask run` and `invoke`; the baseline drew none. Missed-traffic rows fell from 19 to 7, so the candidate over-corrected: the catalogue row says "none elsewhere" but names no case. Authors need the forbidden cases by name where they author traffic: the catalogue row, the authoring reference paragraph, and the sequence recipe step that says the exchange carries traffic.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The traffic catalogue row and the authoring reference name teardown, error and exception paths, hooks that run only on a branch, and one-shot startup as places traffic never goes, and define the hot path as the forward path of one request or event
- [x] #2 The sequence recipe says traffic goes on the request path relationships only, not on every step of the exchange
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. SKILL.md catalogue traffic row: name the forbidden cases. 2. authoring.md traffic paragraph: define the hot path and list where traffic never goes. 3. create-sequence.md step 1: traffic on the request-path relationships only. 4. fmt, sync.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Catalogue traffic row, authoring.md traffic paragraph and create-sequence step 1 now name teardown/context pop, error and exception paths, branch-only hooks, startup, registration and one-shot calls as places traffic never goes, and define the hot path as the forward path on every pass. fmt:check clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Named where traffic does not belong in the three places authors author it; verified by reading the files and fmt:check.
<!-- SECTION:FINAL_SUMMARY:END -->

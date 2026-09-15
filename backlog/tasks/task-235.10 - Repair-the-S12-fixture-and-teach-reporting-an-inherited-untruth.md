---
id: TASK-235.10
title: Repair the S12 fixture and teach reporting an inherited untruth
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 18:52'
updated_date: '2026-09-15 19:07'
labels: []
dependencies: []
references:
  - evals/fixtures/S12.json
  - skills/archboard/SKILL.md
parent_task_id: TASK-235
ordinal: 405000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The grader flags the S12 fixture in every run of both arms: the WSGI server calls full_dispatch_request via wsgi_app (wsgi_app at app.py 1425 is the receiver) and full_dispatch_request calls process_response via finalize_request. Authors inherit the untruth and repeat it. The fixture should say what the source says, and the skill should tell an author that finds the board it edits contradicting the source in the region it touches to say so in the answer rather than silently fix or silently keep it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The S12 fixture routes the WSGI call through Flask.wsgi_app and the finalize path through finalize_request, and the S12 prompt and checks still hold
- [x] #2 The edit workflow says that an inherited inaccuracy in the region being changed is reported in the answer and changed only when the request covers it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
S12 fixture: Flask.wsgi_app and finalize_request added, calls routed through them, prompt and checks unchanged, eval:skill check ok. references/edit.md step 1 says an inherited inaccuracy in the region touched is reported and changed only when the request covers it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixture says what the source says and the edit recipe tells authors to report inherited untruths; verified by eval:skill check and grep.
<!-- SECTION:FINAL_SUMMARY:END -->

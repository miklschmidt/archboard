---
id: TASK-235.10
title: Repair the S12 fixture and teach reporting an inherited untruth
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-15 18:52'
updated_date: '2026-09-15 18:53'
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
- [ ] #1 The S12 fixture routes the WSGI call through Flask.wsgi_app and the finalize path through finalize_request, and the S12 prompt and checks still hold
- [ ] #2 The edit workflow says that an inherited inaccuracy in the region being changed is reported in the answer and changed only when the request covers it
<!-- AC:END -->

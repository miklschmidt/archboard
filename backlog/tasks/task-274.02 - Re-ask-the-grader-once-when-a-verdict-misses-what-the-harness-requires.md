---
id: TASK-274.02
title: Re-ask the grader once when a verdict misses what the harness requires
status: To Do
assignee: []
created_date: '2026-09-19 00:40'
labels: []
dependencies: []
parent_task_id: TASK-274
priority: high
ordinal: 486000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In batch 2026-09-18T23-44-56-390Z the grader passed 5 runs' pictures but left one declared capture without an observation (rubric.md requires one per capture, grader.ts everyCaptureSeen enforces it), so their visual standing is 'incomplete'; and it answered 2 S14 runs with invented feature names instead of the declared ones (off-checklist, set aside). The harness detects both only at report time and never asks again, so a grader lapse costs a run's comparison. Grading is in src/runtime/skill-evaluation/lib/grading-run.ts, grader-runner.ts, claude-grader.ts, codex-grader.ts, grader.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After a grading call returns, each run's verdict is checked for the harness's own obligations: every declared feature answered by its declared name and none invented, and an observation for every capture supplied to it
- [ ] #2 A verdict short of them is sent back once in the same grader session, naming exactly what is missing for which run; the answer replaces the verdict only if it validates, and the attempt is recorded
- [ ] #3 A verdict still short after the retry is filed as today, so the report's incomplete and off-checklist handling is unchanged
- [ ] #4 Works for both grader runners (claude and codex) and does not change the batch input digest; grader usage from the retry is counted
- [ ] #5 Behavioural tests own the check and the single retry, with no live model call
<!-- AC:END -->

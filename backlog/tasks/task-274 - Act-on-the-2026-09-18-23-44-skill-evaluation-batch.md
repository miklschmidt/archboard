---
id: TASK-274
title: 'Act on the 2026-09-18 23:44 skill evaluation batch'
status: To Do
assignee: []
created_date: '2026-09-19 00:40'
labels: []
dependencies: []
priority: high
ordinal: 484000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Batch .skill-evals/2026-09-18T23-44-56-390Z (grader claude-opus-5): all-primary unassessed because 3 runs were set aside as contaminated, all false positives; the grader broke its instructions on 7 runs (5 missing per-capture observations, 2 answered off the checklist) with no retry; S01 regressed (candidate drew held-instance ownership as containment in 5 of 6 runs across two batches, baseline 1 of 6); S05 candidates drew a call between two drawn methods as a self step because of step 9's own example; median author tokens still +20% because the references grew from 69 KB to 90 KB.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The four subtasks are Done
- [ ] #2 The user can re-report the 23:44 batch with no false contamination
<!-- AC:END -->

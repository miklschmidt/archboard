---
id: TASK-253.06
title: Count only guidance the arm's skill package ships
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 14:20'
updated_date: '2026-09-17 14:36'
labels: []
dependencies: []
parent_task_id: TASK-253
ordinal: 446000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The 2026-09-17 report showed guidance 0/3 for baseline S09 and listed those runs as skipping references/read.md, a recipe the frozen baseline package does not have. The column then reads as authors ignoring guidance when there was nothing to read.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A scenario guidance file absent from the arm's installed skill is not expected of that run and not listed as skipped
- [x] #2 A fast test owns it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. classify.ts guidanceStanding takes a shipped predicate and leaves out files the arm lacks. 2. author.ts checks existence under install.skillRoot. 3. Test in events.test.ts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
guidanceStanding takes a shipped(file) predicate; author.ts passes fs.existsSync under install.skillRoot, which for the baseline arm holds the frozen package. A file the package lacks leaves expected and missing. Only future batches change, because the standing is recorded in each run manifest. Test in events.test.ts.

Validation: bun run check exit 0 (lint, fmt, type-check, module, system, repository and browser lanes).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The guidance column no longer expects files the arm's installed skill does not ship. Verified by events.test.ts and bun run check exit 0 (lint, fmt, type-check, module, system, repository and browser lanes). It applies to batches run from now on.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: TASK-253.03
title: A beat about an ordering names both sides of it
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 14:20'
updated_date: '2026-09-17 14:36'
labels: []
dependencies: []
parent_task_id: TASK-253
ordinal: 443000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
S05 walkthrough.beat-subjects failed 2/3 candidate runs in the 2026-09-17 batch: authors now put the step handle in subjects (TASK-243.04) with the parts that step joins, but not the part that relies on the ordering (the View function), because the recipe says "with the parts it joins".
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 create-sequence.md and sequences-views-walkthroughs.md say a beat explaining why one thing happens before another names the earlier step (by handle) and the part that relies on it, and the worked example shows it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. create-sequence.md step 1: an ordering has two sides; the beat names the earlier step by handle with its part, and the part that relies on it. 2. Step 3 check names the relying part (run_simple in the example, whose subjects already show it). 3. sequences-views-walkthroughs.md subjects bullet says the same.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Skill text edited (SKILL.md, authoring.md, create-sequence.md, sequences-views-walkthroughs.md); formatted with oxfmt.

Validation: bun run check exit 0 (lint, fmt, type-check, module, system, repository and browser lanes).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Beat guidance now says a beat about an ordering names the earlier step and the part that relies on it, in both references and the example check. Reviewed in place; behaviour waits for the next batch.
<!-- SECTION:FINAL_SUMMARY:END -->

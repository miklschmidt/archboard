---
id: TASK-253.02
title: A method the request names or the board draws stays its own participant
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 14:20'
updated_date: '2026-09-17 14:36'
labels: []
dependencies: []
parent_task_id: TASK-253
ordinal: 442000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
S05 candidate r2 of the 2026-09-17 batch modelled preprocess_request, which the prompt named as a participant, as a self call on full_dispatch_request, applying the TASK-243.04 rule "do not split a class the board draws as one part into method participants" beyond its intent.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 create-sequence.md says a function or method the request names, or the board already has as its own part, is a participant and the call to it a message, even when it belongs to the same class as the caller; the self rule applies only to a call on a part the board draws whole
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In create-sequence.md step 1, after the self rule, say a function or method the request names or the board draws as its own part is a participant, even on the same class; self is for a call on a part drawn whole.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Skill text edited (SKILL.md, authoring.md, create-sequence.md, sequences-views-walkthroughs.md); formatted with oxfmt.

Validation: bun run check exit 0 (lint, fmt, type-check, module, system, repository and browser lanes).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
create-sequence.md now limits the self rule to parts the board draws whole; a named or already-drawn method stays its own participant. Reviewed in place; behaviour waits for the next batch.
<!-- SECTION:FINAL_SUMMARY:END -->

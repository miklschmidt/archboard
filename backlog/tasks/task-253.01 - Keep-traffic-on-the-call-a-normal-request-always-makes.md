---
id: TASK-253.01
title: Keep traffic on the call a normal request always makes
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 14:20'
updated_date: '2026-09-17 14:36'
labels: []
dependencies: []
parent_task_id: TASK-253
ordinal: 441000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the 2026-09-17 batch every candidate S00 run left traffic off dispatch_request and the view call while setting it on neighbours, and S14 candidate r1 removed it from the view call as "conditional". The TASK-243.03 clause "never on a hook that runs only on a branch" is read as covering calls that an error could skip.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The traffic guidance in SKILL.md, authoring.md and create-sequence.md says a call every normal pass makes carries traffic even when an error or short-circuit could skip it, with an example, while keeping teardown, error paths, optional hooks and startup out
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reword the traffic catalogue row in SKILL.md, the traffic paragraph in authoring.md and step 1 of create-sequence.md: a call a normal pass always makes stays on the path even when an error could skip it; replace 'a hook that runs only on a branch' with 'an optional hook most passes skip'. 2. oxfmt, sync skills.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Skill text edited (SKILL.md, authoring.md, create-sequence.md, sequences-views-walkthroughs.md); formatted with oxfmt.

Validation: bun run check exit 0 (lint, fmt, type-check, module, system, repository and browser lanes).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Traffic guidance now keeps the always-made call (dispatch to the matched handler) on the path while still excluding teardown, error paths, optional hooks and startup. The text was reviewed in place; whether authors follow it waits for the next evaluation batch.
<!-- SECTION:FINAL_SUMMARY:END -->

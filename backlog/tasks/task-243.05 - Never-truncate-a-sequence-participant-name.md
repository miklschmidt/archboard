---
id: TASK-243.05
title: Never truncate a sequence participant name
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 02:26'
updated_date: '2026-09-16 02:36'
labels: []
dependencies: []
parent_task_id: TASK-243
ordinal: 419000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every candidate S05 run failed visually because the participant header for `RequestContext.match_request` is drawn as "RequestContext.match_r…"; baseline S07 rep 2 hit the same with "find_best_app / find_app…". The sequence renderer caps the shared column width at COLUMN_MAX_WIDTH (192) so one long name does not widen every column, and the card then ellipsizes the name with truncate(). A responsibility wraps and may widen the columns; a name cannot wrap, so it is the one text in the picture that is cut. A participant nobody can name is a picture defect the grader fails, whichever arm drew it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A participant name longer than the column cap is drawn complete: the shared column width grows to the longest name plus the card insets, and no participant title carries an ellipsis
- [x] #2 A renderer test holds this for a name wider than the cap while responsibilities still wrap
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. measureColumns in layout/dataflow.ts: floor the shared column width at the longest participant name measured at TITLE_SIZE_MIN plus the card insets, so the cap still holds for ordinary names, a long one shrinks to the minimum title size first, and only then do the columns widen just enough. 2. dataflow.test.ts: a participant named RequestContext.match_request is drawn complete, no drawn title ends in an ellipsis, and a long responsibility still wraps. 3. bun test the renderer, then bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
measureColumns floors the shared width at the longest participant name measured at TITLE_SIZE_MIN plus the card insets; the cap and the title shrink still apply first. New dataflow test draws RequestContext.match_request complete with no drawn text ending in an ellipsis while a long responsibility still wraps; it failed before the change and passes after. Renderer lane 168 pass.

bun run check exit 0: module lane 3128 pass, system lane 163 pass, repository lane 8 pass, browser lanes pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The shared sequence column width now floors at the longest participant name at the smallest title size, so no participant name is ever ellipsized; held by a dataflow test that failed before the change, and bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

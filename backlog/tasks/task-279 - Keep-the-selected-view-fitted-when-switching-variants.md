---
id: TASK-279
title: Keep the selected view fitted when switching variants
status: Done
assignee:
  - '@codex'
created_date: '2026-09-19 13:14'
updated_date: '2026-09-19 13:17'
labels: []
dependencies: []
type: bug
ordinal: 493000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Switching current-cloud-infrastructure from current to mtls-strangler with Everything selected zooms to 150%, clipping most of the board. Variant navigation implicitly focuses changed subjects instead of honoring the selected view.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Switching variants fits all content of the selected view, including Everything, in both directions.
- [x] #2 Manual pan and zoom survive same-variant refreshes; walkthrough focus continues to work.
- [x] #3 A regression test reproduces variant navigation and live canvas verification confirms the full diagram stays visible.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the clipping in the live canvas. 2. Replace automatic change focusing with fitting the selected variant and view, and lock it down through the stage test seam. 3. Run focused and repository validation, rebuild frontend and verify live switching.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced live: Everything on mtls-strangler had scale 1.5 and a 3576x3445.5 surface inside a 2714.4x1428.8 viewport. Removed automatic change-focus behavior and included variant identity in the fit subject. Deleted the now-unused change-focus helper. Three updated regression cases failed before the fix and passed after it. All 137 semantic-board-canvas tests pass without React warnings after wrapping the walkthrough animation wait in act. Focused lint, formatting and frontend build pass. Reloaded the actual in-app canvas and visually verified current -> mtls -> platform and the return to current keep the entire diagram visible. Full check is blocked by unrelated existing complexity violation in avoid-routing.ts:244; type-check is blocked by nine existing ReadingDirection optionality errors in compound-layout.test.ts. Other working-tree and staged edits were preserved.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Variant navigation now fits the complete selected view, including Everything, rather than zooming into changed subjects. Preserves same-variant manual camera state and walkthrough focus. Regression, 137 module tests and live canvas switching verified; unrelated renderer work blocks repository-wide validation.
<!-- SECTION:FINAL_SUMMARY:END -->

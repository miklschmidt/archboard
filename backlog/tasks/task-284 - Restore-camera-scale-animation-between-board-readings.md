---
id: TASK-284
title: Restore camera scale animation between board readings
status: Done
assignee:
  - '@codex'
created_date: '2026-09-19 23:10'
updated_date: '2026-09-19 23:23'
labels:
  - frontend
  - motion
dependencies: []
type: bug
ordinal: 498000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Navigating between boards and variants now makes a differently sized diagram jump to its fitted zoom, losing the scale transition readers used to see. The recent variant fit fix kept the selected view in frame but may have changed the camera motion. Restore a visible, predictable transition while retaining correct final fit and reduced-motion behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Switching variants with different diagram dimensions visibly animates the camera from its current scale to the fit for the selected view, then lands exactly at that fit.
- [x] #2 Switching boards with different diagram dimensions gives a visible scale transition and leaves the arriving board correctly fitted.
- [x] #3 Reduced motion lands immediately, and manual camera movement after navigation remains usable.
- [x] #4 A focused regression reproduces the missing motion and passes after the fix.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the missing camera motion with a deterministic stage-level frame test for differently sized variants and boards. 2. Keep whole-view fit targeting and glide subsequent picture changes, with an immediate first fit and reduced-motion landing. 3. Verify final framing, manual camera movement after navigation, focused module and browser tests, and the repository gate; simplify the test setup.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The stage-level board and variant animation cases failed before the fix because data-camera-motion was absent, then passed after restoring a glide for subsequent picture changes. The first picture still fits immediately. The camera lands at the whole selected view fit; manual pan after arrival and reduced-motion board/variant paths pass.

Validation: 140 semantic-board-canvas module tests pass; focused serial browser lane passes 6/6; repository policy passes 8/8. Full bun run check passes lint, formatting, type-check, frontend build, and modules, then fails in untouched tests/system/canvas-state/codex-pane-context.test.ts:83 on repeatable realtimeStart not_delivered (command_failed). The focused voice owner fails the same way in isolation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restored the camera glide when a pane receives another board, variant, or view while preserving the selected-view fit and first-picture immediate landing. Deterministic stage tests reproduced the regression and now verify intermediate and final scale, reduced motion, and manual pan. Focused module, browser, and repository checks pass; full check remains blocked by the unrelated, repeatable live voice delivery failure.
<!-- SECTION:FINAL_SUMMARY:END -->

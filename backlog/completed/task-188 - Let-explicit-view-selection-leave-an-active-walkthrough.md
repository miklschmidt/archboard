---
id: TASK-188
title: Let explicit view selection leave an active walkthrough
status: Done
assignee:
  - '@codex'
created_date: '2026-09-12 22:48'
updated_date: '2026-09-12 22:56'
labels: []
dependencies: []
type: bug
ordinal: 347000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On the renderer Readable layout proposal, Everything and Renderer integration appear inert while Why this layout model is open. The beat view overrides the selection. Explicit view selection should end the walkthrough and display the chosen view.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Selecting Everything or a named view during a view-scoped walkthrough closes the walkthrough and displays the chosen view.
- [x] #2 Opening and advancing walkthroughs still applies beat views; closing normally restores the prior chosen view.
- [x] #3 A focused rendered regression and the full check pass; verify both affected controls in the live dogfood frontend.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the view override on the live renderer proposal (confirmed: closing the walkthrough restores working controls). 2. Add a rendered regression for explicit view choices during a scoped beat. 3. End the walkthrough at the view-choice event, preserving normal beat and close behavior. 4. Run focused tests and the full check, then verify the affected controls live.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced live: Everything stayed unselected and scoped 5-node diagram remained until walkthrough closed; Renderer integration then correctly drew 7 nodes/8 connections. The root cause is viewToRead preferring beat.view while the view bar writes only level selection. Added a stable event handler that closes the walkthrough and forwards the view choice. Two rendered regression cases failed before the fix and pass now; related view/narrative/level tests passed. Regressions live with view tests to respect the existing test-file size limit.

Verified rebuilt frontend in the live dogfood browser: Everything exits an active scoped walkthrough and draws 11 nodes/16 connections; Renderer integration exits it and draws 7 nodes/8 connections. Reopening and advancing to beat 2 still uses the 5-node pipeline view; normal Close restores Renderer integration. Full bun run check passed exit 0 (lint, formatting, types, build, module/system/repository and serial-browser suites), log /tmp/archboard-view-selection-check.log. Simplification check: retained existing narrative override model and handled explicit view choice at its event boundary, without new state or effects.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed view buttons appearing inert during a walkthrough by closing the guided reading and applying the explicit view choice together. Added rendered regression coverage for Everything and named-view choices; full check and live-browser verification passed.
<!-- SECTION:FINAL_SUMMARY:END -->

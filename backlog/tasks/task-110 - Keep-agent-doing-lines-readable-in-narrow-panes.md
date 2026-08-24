---
id: TASK-110
title: Keep agent doing lines readable in narrow panes
status: Done
assignee:
  - '@codex'
created_date: '2026-08-23 23:17'
updated_date: '2026-08-23 23:24'
labels: []
dependencies: []
modified_files:
  - frontend/src/canvas/CanvasPane.tsx
  - frontend/src/shell/shell.css
  - scripts/check-fixed-point.mjs
type: bug
ordinal: 112000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The frontend clips recent agent doing text at the pane's right edge, so a person cannot read the activity on a narrow display or pane.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each recent doing entry remains fully readable within a narrow pane without horizontal clipping
- [x] #2 Timestamps remain aligned with their doing entry
- [x] #3 A focused frontend regression check fails on the clipped layout and passes after the fix
- [x] #4 Browser evidence confirms the presentation at the width shown in the report
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build a focused browser reproduction at the reported narrow width.
2. Identify the layout rule that clips the doing rows and make the smallest presentation change.
3. Run the focused check, frontend build, and browser visual verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced in the real-browser fixed-point check at a 420 px viewport: four of five rows had scroll widths 29-118 px beyond their 299 px client width while the panel itself fit. Replaced the clipped flex row with a two-column grid and wrapped the doing text in its own overflow-safe span. The focused browser check now reports equal client and scroll widths for all five rows; in-app browser pixels confirm aligned timestamps and wrapped continuation lines.

Validation passed: bun run test completed the 26-suite push gate, including type-check, the fixed-point browser check, typed-text, and live-session. Visual acceptance used the in-app browser at 420 x 700: all five rows fit at 299 px client/scroll width, the panel stayed within the pane, and timestamps shared one x-coordinate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Changed the recent doing rows from clipped single-line flex items to a two-column grid with wrapping activity text. This keeps timestamps aligned and makes every entry readable in narrow panes. Verified red then green in the existing real-browser fixed-point check at 420 px, approved the rendered pixels in the in-app browser, and passed the full bun run test gate.
<!-- SECTION:FINAL_SUMMARY:END -->

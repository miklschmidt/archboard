---
id: TASK-288
title: Keep continuing arrow routes fixed when toggling comparison
status: Done
assignee:
  - '@codex'
created_date: '2026-09-20 01:04'
updated_date: '2026-09-20 01:14'
labels: []
dependencies: []
type: bug
ordinal: 502000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On Cloud Infrastructure at paneA=cloud infrastructure@Nc8vWLvX, switching Show comparison on canvas moves five continuing arrow paths (for example uDMYsoQs moves its end run from y=1226 to y=1208). This reproduces with an empty browser picture cache. The toggle should change comparison decoration and removed context while preserving the geometry of continuing relationships. TASK-283 recently introduced standing-aware routing channels and may be adjacent.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Toggling comparison leaves the attachment positions and routes of continuing relationships unchanged when their semantic endpoints and other visible geometry are unchanged.
- [x] #2 Added or removed comparison context still enters and exits with the existing picture transition.
- [x] #3 A focused renderer regression catches the observed path movement, and the live Cloud Infrastructure board no longer reproduces it.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce and minimize the route shift, then add a failing renderer regression. 2. Retain derived standings for layout while hiding only their painted marks and removed context. 3. Verify focused tests, type checks, lint, frontend build, and the reported board in the browser; simplify and commit. The user directed us to rely on the other task for the full gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced in a fresh browser origin: five of 19 Cloud Infrastructure arrow paths move. A direct renderBoard loop on the current board also fails for the same five IDs. Minimized to two nodes with one existing and one added same-kind parallel connection; compared rendering separates their routes, plain rendering stacks them.

The renderer regression went red: two same-kind parallel edges (one unchanged, one added) stacked only in plain mode while node boxes stayed identical. The fix retains the derived standing map for layout and suppresses it only in painting. Focused comparison, channel-routing, and UI transition tests pass (11 tests); the original Cloud Infrastructure renderBoard comparison now reports zero changed routes across 19 edges.

Validation: 11 focused tests passed (61 assertions), including both directions of the existing picture transition. Frontend build, type check, lint, focused formatting, and git diff check passed. After rebuilding the frontend, the live Cloud Infrastructure board showed 19 arrow paths with zero route changes when comparison was turned off and back on. The separate full gate was stopped at the user request; the other task completed its gate on its clean integrated code, excluding these uncommitted changes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Retained comparison standings as routing input while hiding only their canvas marks in plain mode, so toggling comparison keeps continuing arrows fixed. Verified with a red-then-green renderer regression, 11 focused tests, build/type/lint/format checks, and the live Cloud Infrastructure board (zero path changes across 19 arrows in both toggle directions).
<!-- SECTION:FINAL_SUMMARY:END -->

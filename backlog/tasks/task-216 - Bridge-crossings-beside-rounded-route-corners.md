---
id: TASK-216
title: Bridge crossings beside rounded route corners
status: Done
assignee:
  - '@codex'
created_date: '2026-09-14 23:04'
updated_date: '2026-09-14 23:17'
labels:
  - bug
dependencies: []
ordinal: 376000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A user screenshot of semantic+renderer@IV2KX3GX shows an unbridged crossing immediately above a rounded turn into SVG painters. Readers cannot distinguish that crossing from a junction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The reported crossing has a visible bridge without disrupting its rounded turn or endpoints.
- [x] #2 Focused geometry regression and complete check gate pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the reported routed geometry and minimize a failing crossing case. 2. Correct bridge eligibility while preserving route clearance. 3. Verify the original board, run the complete gate, simplify and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reproduced the original IV2KX3GX crossing at (435,1078.4): preferred vertical route ends only 1.8 units later at a rounded corner. Reversing paint preference alone also failed because symmetric lower-run room and whole cubic hull bounds rejected a safe horizontal bridge. Added a second pass for otherwise unmarked crossings, retained local masks, refined cubic bounds conservatively by de Casteljau subdivision, and sorted preferred/fallback bridges together along each run. A seven-node predecessor/proposal fixture fails through renderArchitecture before the fix and passes afterward. Original full-board geometry assertion passes and browser inspection shows the new horizontal bridge with the original turn intact. Complete gate running. Simplification retains one geometry/mask pipeline; no board or skill authoring contract changes.

Final verification: all 140 semantic-renderer tests pass (2686 assertions); complete bun run check passes with exit 0 under required process/socket permissions, including 3006 module tests and all system/browser lanes. Refined the existing roundBridges test reader with overlapping lookahead so a preceding rounded turn cannot hide the next bridge; the dense crossing owner now validates masks on the actual crossed route regardless of paint order. Restarted the main dogfood canvas and verified IV2KX3GX through semantic render; returned SVG contains the exact bridge at the reported crossing, board version remains 7, and status reports no stale source.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed bridges missing beside rounded turns by trying the other route when the preferred route cannot fit, with conservative local curve clearance. Preserves route corners, endpoint geometry and narrow masks. Verified the original board through the restarted live canvas, 140 renderer tests and the complete check gate.
<!-- SECTION:FINAL_SUMMARY:END -->

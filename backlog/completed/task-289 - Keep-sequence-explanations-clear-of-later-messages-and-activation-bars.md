---
id: TASK-289
title: Keep sequence explanations clear of later messages and activation bars
status: Done
assignee: []
created_date: '2026-09-20 01:12'
updated_date: '2026-09-20 01:47'
labels: []
dependencies: []
references:
  - >-
    http://localhost:3100/?paneA=endpoint+trust+sequences@eEgD8jXz&viewA=XrH4SRvZ
modified_files:
  - src/transformers/semantic-renderer/lib/layout/dataflow.ts
  - src/transformers/semantic-renderer/lib/layout/step-rows.ts
  - src/runtime/semantic-renderer/tests/step-notes.test.ts
type: bug
ordinal: 503000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Service trust view of Endpoint Trust Sequences (proposal eEgD8jXz, view XrH4SRvZ) shows explanatory step text overlapping sequence strokes and activation bars. The board meaning is intact; renderer-owned spacing should keep these annotations readable without authoring layout into the board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Step explanations in the linked Service trust view do not overlap message lines, labels, or activation bars.
- [x] #2 Other sequence views with short or absent explanations retain readable spacing and ordered messages.
- [x] #3 A focused regression check catches this overlap and the renderer passes the repository gate.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the collision in the renderer test owner with a two-participant synchronous step carrying a long explanation. 2. Make note placement reserve the receiving activation/lifeline corridor and keep measured text complete. 3. Verify the linked board and adjacent views in browser/SVG, run focused tests and bun run check, then simplify and commit only this task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The linked Service trust view had a note plate x143..353 masking the Service CA activation x339..351. A two-participant renderer test failed on that collision before the change and now passes. Note width/placement now reserves a measured corridor between participant bars; all four flows in the real proposal render with zero note/bar intersections. Full gate and live browser verification remain.

Final verification: the restarted canvas rendered Service trust with four notes, four activation bars and ten step labels; no note/bar or note/other-label intersections. All four proposal sequence views rendered with zero such intersections (2/5/4/4 notes). The Service trust PNG was visually checked for line clearance; the focused regression and bun run check passed. Simplification kept note sizing and anchoring in step-rows, with only corridor inputs from dataflow.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Measured note widths reserve a lifeline corridor and place explanations clear of activation bars and later messages. Verified the linked view and the other three sequence views in live SVG/PNG, plus focused tests and the complete repository gate.
<!-- SECTION:FINAL_SUMMARY:END -->

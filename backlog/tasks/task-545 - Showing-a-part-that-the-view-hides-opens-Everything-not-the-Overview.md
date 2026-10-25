---
id: TASK-545
title: Showing a part that the view hides opens Everything, not the Overview
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T21:57:00Z'
updated_date: '2026-10-25T22:13:00Z'
labels:
  - frontend
  - bug
dependencies: []
type: bug
ordinal: 951000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The About page's show control and the header's code warnings bring a part into view. When the view on screen does not draw the part, the pane is meant to open the whole board first (useSubjectFocus). It asks for view null, which since ADR 0052 is the Overview, and the Overview draws every container closed. So on a board read through its Overview, showing a part inside a container does nothing: the view stays, and the camera does not move. Found while QA-ing TASK-537.03 on the Board viewer board, whose step through a design question uses the same path. The unit tests did not see it, because their fixture draws the whole board for view null.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Showing a part that the view on screen does not draw opens the view named Everything, and the camera then fits the part
- [x] #2 This holds from the Overview and from an authored view
- [x] #3 The About and code-warning tests assert the request for Everything
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. useSubjectFocus asks for the view named Everything (EVERYTHING_VIEW.id) where it asked for view null.
2. The About and code-warning stage tests assert the request for view=Everything.
3. QA through the design question steps on the Board viewer board, from the Overview.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed in b9672eecb. The two stage tests that own the widening now assert view=Everything; before, their fixture drew the whole board for view null, so they could not see the bug. QA: from the Overview of Board viewer, each design question step opened Everything and fitted its entry point (TASK-537.03 notes).

Evidence: semantic-board-about.test.tsx (an authored view, the part fitted near its corner) and semantic-board-code-findings.test.tsx (the authored view parts, the camera closer after the fit) assert the request for view=Everything, 19 pass. QA from the Overview of Board viewer: each of five design question steps opened Everything and fitted its entry point. Gate lanes as in TASK-544.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Showing a part that the view on screen does not draw now opens the view named Everything, then fits the part. It asked for view null, which is the Overview since ADR 0052, so the About page show control, the code warnings and the design question steps did nothing for a part inside a closed container.
<!-- SECTION:FINAL_SUMMARY:END -->

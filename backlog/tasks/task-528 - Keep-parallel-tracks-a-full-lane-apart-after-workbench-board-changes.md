---
id: TASK-528
title: Keep parallel tracks a full lane apart after workbench board changes
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-25T00:17:00Z'
updated_date: '2026-10-25T00:18:00Z'
labels: []
dependencies: []
references:
  - https://github.com/miklschmidt/archboard/pull/2
type: bug
ordinal: 936000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR #2 fails the complete validation gate. The Voice coordinator track drawing places ovIBdlhV and qU9USAdL four pixels apart, below the existing lane clearance contract.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The Voice coordinator track drawing passes the existing clearance assertions
- [ ] #2 The complete validation gate passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce the four-pixel route clearance failure and identify the routing cause. 2. Repair the existing routing mechanism without changing the board or weakening assertions. 3. Run focused renderer tests and the complete validation gate. No board is affected: this corrects routing behavior within the existing renderer architecture.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The existing corpus reproduces the hosted failure. Parting tries only the colliding pair boundaries. Moving the target port to 3646 clears qU9USAdL at 3662 but crowds X6q6P132 at 3642, so the guard rejects it. Candidate boundaries from every net in the channel let the same guarded move clear both neighbors. The focused Voice coordinator track test now passes.
<!-- SECTION:NOTES:END -->

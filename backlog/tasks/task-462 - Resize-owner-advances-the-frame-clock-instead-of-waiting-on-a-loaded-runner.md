---
id: TASK-462
title: Resize owner advances the frame clock instead of waiting on a loaded runner
status: In Progress
assignee:
  - codex
created_date: '2026-10-11 16:28'
updated_date: '2026-10-11 16:32'
labels: []
dependencies: []
type: bug
ordinal: 809000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Hosted run 38153663557 job 114515280382 changes the camera during the synthetic resize slide. Its frame helper waits on real timers, so runner stalls can exceed the real resize settle deadline between frames.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A constrained reproduction demonstrates the original runner-delay failure.
- [ ] #2 The owner advances the existing stepped frame clock and retains both original camera assertions and the production settle duration.
- [ ] #3 The focused owner and complete normal local and hosted gates pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No board is affected because this repair changes only a test clock. Reproduce delayed frame scheduling, then drive the existing frame-clock seam by hand. Keep the real settle threshold and every camera assertion. Review the clock and assertion contract before publishing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
A scratch copy delays each original quarter-settle frame wait by a complete settle interval. Both the hosted run and this reproduction change the camera before the unchanged equality assertion. The red reproduction fails in 604 ms. The repaired owner uses the existing takeFrames seam, keeps both original camera assertions, all seven widths, and the 64 ms production settle threshold. The normal focused owner passes. A second scratch probe stalls wall time before each controlled advance to prove that runner delay no longer drives the resize clock.
<!-- SECTION:NOTES:END -->

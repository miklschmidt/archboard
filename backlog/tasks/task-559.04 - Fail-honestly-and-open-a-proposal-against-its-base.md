---
id: TASK-559.04
title: Fail honestly and open a proposal against its base
status: Done
assignee:
  - '@claude'
created_date: '2026-10-30T16:44:00Z'
updated_date: '2026-10-30T20:34:00Z'
labels:
  - frontend
dependencies:
  - TASK-559.03
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 976000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A draft opens against Current and reports about 3,000 changes, then one drew for 48.8 s and ended in a raw router error. A healthy refresh shows a false stale warning, and a failed draw has no Retry. Each of these states something untrue to the reader.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A draft with a `predecessorCheckpoint` opens against that checkpoint, and Gate 5 holds
- [x] #2 A failed draw keeps the last picture, names the failure, and offers Retry and Back
- [x] #3 A healthy refresh shows nothing, and a lost server does not move the picture
- [x] #4 An address to a removed module says that it was removed and offers its retained reading
- [x] #5 A filtered empty result offers `Show whole scope`
- [x] #6 The reader offers an explicit After choice and `Compare with current`
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Merged in 868d43b80 with the left column. Draft 93RlBGLx opens compared with its base, TASK-482.07, with 49 changed subjects and no error. A failed draw keeps the picture and offers Retry and Back. A lost server leaves the picture rectangle unchanged. Known limits: Back needs history, the walkthrough BeatStage failure has no Retry, and a snapshot has no states, so retained states join the menu when the read completes. Uncached gate on 217027a12 passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A proposal opens against its predecessor checkpoint. A failed draw or read keeps the picture, names the failure and offers a way out. A removed module opens its newest retained reading. A filtered empty reading offers the whole scope. After and Compare with current work from a proposal.
<!-- SECTION:FINAL_SUMMARY:END -->

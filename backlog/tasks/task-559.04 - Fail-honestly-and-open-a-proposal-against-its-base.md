---
id: TASK-559.04
title: Fail honestly and open a proposal against its base
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-30T16:44:00Z'
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
- [ ] #1 A draft with a `predecessorCheckpoint` opens against that checkpoint, and Gate 5 holds
- [ ] #2 A failed draw keeps the last picture, names the failure, and offers Retry and Back
- [ ] #3 A healthy refresh shows nothing, and a lost server does not move the picture
- [ ] #4 An address to a removed module says that it was removed and offers its retained reading
- [ ] #5 A filtered empty result offers `Show whole scope`
- [ ] #6 The reader offers an explicit After choice and `Compare with current`
<!-- AC:END -->

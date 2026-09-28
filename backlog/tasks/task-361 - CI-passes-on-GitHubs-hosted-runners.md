---
id: TASK-361
title: CI passes on GitHub's hosted runners
status: To Do
assignee: []
created_date: '2026-09-28 17:48'
labels:
  - ci
dependencies: []
priority: high
type: bug
ordinal: 602000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CI has failed on every push to main since 2026-09-20 (gh run list --repo miklschmidt/archboard). In run 36459326838 (2026-09-28) the Linux job's hosted checks failed with 'what one capture is > real pixels of the renderer's picture, at one bitmap pixel per diagram pixel' timing out after Bun's default 5000 ms, twice; the macOS job failed 'process observation > reads the current process through the native platform boundary' in 4 ms, which is not a timeout. The user reports many timeout failures and expects GitHub's runners, whose performance varies widely, to need about three times the default timeouts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The failures of the recent failed CI runs are classified as timeout or real, with the evidence for each
- [ ] #2 Test timeouts that fail only because of runner speed are raised, about three times their current value, where the repository sets them (bunfig, per-test and lane timeouts, CI step timeouts), without hiding a real failure
- [ ] #3 Real failures, including the macOS process observation test, are fixed or tracked with their cause
- [ ] #4 A push of the change turns CI green on both jobs, or the remaining failure is named with its cause
<!-- AC:END -->

---
id: TASK-492
title: semantic footprint reads a named head branch from Git
status: To Do
assignee: []
created_date: '2026-10-17 10:53'
labels:
  - history-lens
  - cli
dependencies: []
type: bug
ordinal: 857000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
semantic footprint compares a proposal with the commits from --base up to the checkout's HEAD. In a pull-request stack every layer is its own branch, and only one of them is checked out (on Device Trust Control Plane: feat/device-trust). For every other layer an agent writing the pull-request body cannot use footprint and reads the diff by hand instead, so the check of 'every changed part is drawn' is skipped exactly where a stack needs it. Reported 2026-10-17 by the agent fixing the device-trust pull-request bodies. The archboard-pr skill (section 2 step 6) tells agents to run footprint for each pull request.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 semantic footprint --head <ref> reads the commits from --base to that ref from Git, without checking it out and without changing the working tree
- [ ] #2 Without --head, footprint reads up to the checkout's HEAD as now
- [ ] #3 A --head the checkout cannot resolve is refused with a code that names the ref, and nothing is reported as unchanged
- [ ] #4 A test shows footprint --head on a branch that is not checked out reports the parts that branch changed
- [ ] #5 The archboard-pr skill's footprint step names --head for a stack layer that is not checked out
<!-- AC:END -->

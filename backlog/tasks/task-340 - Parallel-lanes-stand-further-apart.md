---
id: TASK-340
title: Parallel lanes stand further apart
status: To Do
assignee: []
created_date: '2026-09-24 15:52'
labels:
  - renderer
dependencies: []
priority: medium
type: feature
ordinal: 581000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User review 2026-09-24: where lanes run parallel the picture is very compact and the user wants more distance between them. Parallel lanes are spaced by ROUTE_NUDGE_DISTANCE (12 units, libavoid's ideal nudging distance, also used for pin spacing and label channels in src/transformers/semantic-renderer/config.ts).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Parallel lanes stand visibly further apart than today, on every dogfood board
- [ ] #2 Every view of every dogfood board still draws, and each picture that changed was looked at
- [ ] #3 Before and after pictures are shown to the user, who chooses the distance
<!-- AC:END -->

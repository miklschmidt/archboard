---
id: TASK-510
title: Track historical commit suggestions as read work
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-23 02:36'
labels: []
dependencies: []
ordinal: 917000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Live TASK-509 smoke reproduced an internal error for semantic correct --suggest. The GET route used the mutation wrapper, but GET requests have no mutation admission lease.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The live suggestion command returns timestamp-based commit guesses.
- [ ] #2 The route runs as cancellable checkout work and does not require mutation admission.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Replace the GET mutation wrapper with checkout request tracking. Extend the route owner to mount the production wrapper. No architecture board is affected because this repairs route lifetime handling inside the planned historical correction routes.
<!-- SECTION:PLAN:END -->

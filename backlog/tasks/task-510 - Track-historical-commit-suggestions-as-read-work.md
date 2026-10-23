---
id: TASK-510
title: Track historical commit suggestions as read work
status: Done
assignee:
  - '@codex'
created_date: '2026-10-23 02:36'
updated_date: '2026-10-23 02:56'
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
- [x] #1 The live suggestion command returns timestamp-based commit guesses.
- [x] #2 The route runs as cancellable checkout work and does not require mutation admission.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Replace the GET mutation wrapper with checkout request tracking. Extend the route owner to mount the production wrapper. No architecture board is affected because this repairs route lifetime handling inside the planned historical correction routes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: asyncEndpoint requires a mutation lease, but admission intentionally excludes GET. The suggestion route now uses checkoutWork.trackRequest. The regression test mounts the actual production route registration. Live semantic correct --suggest returned the supersession timestamp and a real full commit hash after restart. Five focused route tests pass.

Final complete bun run check passed, including the production route regression owner and all browser owners. Final server restart and plain vault check passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Historical commit suggestions run as read-only checkout work. The production route regression owner, live CLI suggestion and complete repository gate pass.
<!-- SECTION:FINAL_SUMMARY:END -->

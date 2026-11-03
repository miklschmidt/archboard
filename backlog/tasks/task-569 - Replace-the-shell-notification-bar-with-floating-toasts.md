---
id: TASK-569
title: Replace the shell notification bar with floating toasts
status: Done
assignee:
  - '@codex'
created_date: '2026-11-03T15:23:00Z'
updated_date: '2026-11-03T15:30:00Z'
labels: []
dependencies: []
ordinal: 1017000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The notification bar consumes canvas space and truncates messages. The user requested shadcn toast messages with full-send delivery.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Messages float over the workspace and wrap their descriptions without changing pane height
- [x] #2 Recovery actions remain usable and persistent, while informational messages expire
- [x] #3 Toasts retain the shell font and remain visible during fullscreen presentation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Use Sonner to present existing shell notices. Preserve notice state and action routing. Give each rendered notice a distinct toast identity. Run the repository gate and review, then publish and merge.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The canonical Shell module still owns presentation and actions. This change adds no architectural module or relationship, so no architecture proposal is needed.

Proof: nix develop --command bun run check passed 21/21 tasks, including all 49 browser files. The shell browser owner passed 282 assertions and exercised recovery actions, typography, containment, and fullscreen presentation. Informational toasts use a six-second Sonner timer and remove shell state on expiration. Reviewed with sol-loop in three rounds using gpt-6.1-sol at high effort. Final verdict approved. Review exposed stale dismissal callbacks, now guarded by the exact rendered toast identity. All review worktrees were removed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the bar with floating Sonner toast cards. Messages wrap without changing pane height. Errors and recovery actions stay visible until dismissal. Informational messages expire after six seconds. Toasts use the shell font and remain within the fullscreen stage. The complete repository gate passes.
<!-- SECTION:FINAL_SUMMARY:END -->

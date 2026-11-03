---
id: TASK-569
title: Replace the shell notification bar with floating toasts
status: In Progress
assignee:
  - '@codex'
created_date: '2026-11-03T15:23:00Z'
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
- [ ] #1 Messages float over the workspace and wrap their descriptions without changing pane height
- [ ] #2 Recovery actions remain usable and persistent, while informational messages expire
- [ ] #3 Toasts retain the shell font and remain visible during fullscreen presentation
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Use Sonner to present existing shell notices. Preserve notice state and action routing. Give each rendered notice a distinct toast identity. Run the repository gate and review, then publish and merge.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The canonical Shell module still owns presentation and actions. This change adds no architectural module or relationship, so no architecture proposal is needed.
<!-- SECTION:NOTES:END -->

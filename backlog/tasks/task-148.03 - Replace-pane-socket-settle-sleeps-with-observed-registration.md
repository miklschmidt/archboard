---
id: TASK-148.03
title: Replace pane socket settle sleeps with observed registration
status: To Do
assignee: []
created_date: '2026-09-02 21:36'
labels: []
dependencies: []
parent_task_id: TASK-148
priority: high
type: bug
ordinal: 274000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pane tests wait for an observable registration contract rather than a fixed socket-settle delay, making the shared test helper reliable and faster.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 openTestPane and its 15 consumers replace the fixed 80 ms settle delay with deterministic readiness acknowledgement or observed registration.
- [ ] #2 The scope covers pane-websocket.ts, canvas-state/support/pane-session.ts, and applicable direct post-open sleeps.
- [ ] #3 Focused coverage preserves open and close behavior, multi-pane isolation, and cleanup.
- [ ] #4 Measured aggregate duration is materially lower than the fixed-delay baseline.
<!-- AC:END -->

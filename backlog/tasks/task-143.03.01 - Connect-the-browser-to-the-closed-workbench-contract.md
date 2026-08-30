---
id: TASK-143.03.01
title: Connect the browser to the closed workbench contract
status: To Do
assignee: []
created_date: '2026-08-30 15:09'
updated_date: '2026-08-30 15:48'
labels: []
dependencies:
  - TASK-143.01.02
  - TASK-143.01.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-transport
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 198000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the browser transport in `src/ui/workbench-transport`. It exchanges only shared snapshots/events/commands with the Codex gateway and never imports runtime, server, process, credentials, or generated protocol code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The transport exposes connecting, ready, disconnected, reconnecting, lease-lost, and child-invalidated states plus validated command results.
- [ ] #2 Commands always carry explicit thread-link/turn/request identity and expected state; no action infers a target from focus history or the latest event.
- [ ] #3 Tests prove same-child hydration, replacement-child invalidation, event ordering, cancellation, malformed reply refusal, and cleanup.
<!-- AC:END -->

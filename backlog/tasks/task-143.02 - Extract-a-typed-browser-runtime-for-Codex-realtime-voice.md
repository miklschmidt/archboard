---
id: TASK-143.02
title: Build a private browser package for Codex realtime voice
status: To Do
assignee: []
created_date: '2026-08-30 11:44'
updated_date: '2026-08-30 15:48'
labels: []
dependencies:
  - TASK-143.01
references:
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/desktop-app-server-sharing-research.md
  - docs/design/codex-workbench-delivery-map.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 164000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integration milestone for the complete private `packages/codex-realtime` contract, serialized root registration, automated boundary enforcement, native browser media/WebRTC, and the sole Archboard 0.151.0 realtime adapter delivered by TASK-143.02.01-.05. Publication remains out of scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The private package is covered by root type/lint/format/test/build and repository inventory/boundary policy and owns browser media lifecycle without Archboard/React/assistant-ui/Node/generated imports.
- [ ] #2 The sole host adapter owns exact realtime binding/phase, unique session IDs, stop/closed/restart serialization, guarded append, phase-gated events, and item-scoped canonical transcript.
- [ ] #3 Controlled package/browser fakes cover every reachable lifecycle/failure, creation order, stale event, recovery, and cleanup through the frozen export.
<!-- AC:END -->

---
id: TASK-143.02
title: Build a private browser package for Codex realtime voice
status: To Do
assignee: []
created_date: '2026-08-30 11:44'
updated_date: '2026-08-30 15:16'
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
Integration milestone for the private framework-neutral `packages/codex-realtime` contract, its native browser media/WebRTC engine, and the Archboard 0.151.0 realtime adapter delivered by TASK-143.02.01-.03. The package exists for Archboard's current voice consumer; publication obligations remain out of scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The private package owns microphone, peer, ordered data channel, remote audio, level analysis, mute, recovery, stop, and exact-once cleanup without Archboard, React, assistant-ui, Node, or generated-protocol imports.
- [ ] #2 The host adapter mints and matches exact realtime session IDs and rejects stale child/coordinator/session delivery before every active append.
- [ ] #3 Controlled browser fakes and a real-browser owner cover every reachable lifecycle/failure state, creation order, recovery, and resource cleanup through the package's public export.
<!-- AC:END -->

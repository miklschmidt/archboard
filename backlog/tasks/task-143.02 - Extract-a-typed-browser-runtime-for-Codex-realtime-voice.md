---
id: TASK-143.02
title: Build a browser-native Codex realtime module
status: To Do
assignee: []
created_date: '2026-08-30 11:44'
updated_date: '2026-08-30 16:25'
labels: []
dependencies: []
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
Integration milestone for a framework-neutral `src/ui/codex-realtime` public contract, native browser media/WebRTC lifecycle, sole 0.151.0 host adapter, boundary enforcement, and real-process contract owner. The module is extraction-ready but Archboard remains private and publication/workspace packaging is out of scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The module owns browser media lifecycle without React, assistant-ui, Node, generated protocol, Archboard runtime, global stores, or a second transcript reducer and exposes one frozen host interface.
- [ ] #2 The sole runtime adapter owns exact realtime V3 binding/phase, unique session IDs, WebRTC SDP handshake, guarded append, timeline recovery, stop/closed/restart serialization, and item-scoped canonical transcript.
- [ ] #3 Module, process-contract, controlled browser, and clean-process smoke owners cover every reachable lifecycle/failure, stale event, uncertain append, recovery, and cleanup through public exports.
<!-- AC:END -->

---
id: TASK-143.02.03
title: Adapt the Codex realtime protocol to the browser module
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 16:35'
labels: []
dependencies:
  - TASK-143.01.07
  - TASK-143.01.08
  - TASK-143.02.01
  - TASK-143.02.02
  - TASK-143.06.01
  - TASK-143.01.16
references:
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/runtime/codex-realtime
parent_task_id: TASK-143.02
priority: high
type: task
ordinal: 183000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the sole adapter from raw decoded Codex 0.151.0 realtime/timeline events to the browser-native module. It owns realtime phase and canonical transcript; the browser media module owns neither.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each start mints a unique realtimeSessionId and sends outputModality audio, version v3, transport {type: webrtc, sdp}, includeStartupContext true, clientManagedHandoffs true, documented handoff/tail choices, exactly one fresh developer-role semantic brief, and canonical start/end instructions.
- [ ] #2 The empty start response conveys no SDP or readiness; the adapter accepts an answer only from matching thread/realtime/sdp and becomes ready only after matching thread/realtime/started child, thread, session, and version.
- [ ] #3 Only item-scoped realtime item started/transcript delta/completed events create canonical transcript. Thread-only error/closed and legacy flat transcript events update diagnostics/phase but never create content; WebSocket appendAudio/outputAudio paths are rejected.
- [ ] #4 Recovery exhausts thread/timeline/list pagination, detects cursor loops, and merges persisted pages with live item events by stable identity without duplicates, gaps hidden as success, or reordered turns.
- [ ] #5 appendText, appendSpeech, stop, and recovery revalidate captured child/epoch/thread/coordinator/session immediately before one attempt; lost responses classify outcome_unknown, uncertain spoken approval falls back visual, and no path leaves awaiting_user.
<!-- AC:END -->

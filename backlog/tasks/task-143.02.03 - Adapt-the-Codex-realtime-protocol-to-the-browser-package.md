---
id: TASK-143.02.03
title: Adapt the Codex realtime protocol to the browser module
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 18:06'
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
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-realtime
  - src/runtime/codex-realtime/tests/adapter.test.ts
parent_task_id: TASK-143.02
priority: high
type: task
ordinal: 183000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the sole adapter from raw decoded Codex 0.151.0 realtime/timeline events to the browser-native module. It owns realtime phase and canonical transcript; the browser media module owns neither.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each start mints a unique realtimeSessionId and sends outputModality audio, version v3, WebRTC, includeStartupContext true, clientManagedHandoffs false, delegationAckFiller true, flushTranscriptTailOnSessionEnd true, codexResponsesAsItems false, handoff mode bemTags, exact voice breeze, one fresh developer semantic item, and canonical start/end instructions; there is no selector or fallback.
- [ ] #2 The empty start response conveys no SDP/readiness; answer comes only from matching thread/realtime/sdp and readiness only from matching thread/realtime/started child, thread, session, and version.
- [ ] #3 Only item-scoped realtime item started/transcript delta/completed events create canonical transcript. Thread-only error/closed and flat transcript events update diagnostics/phase but never content; WebSocket appendAudio/outputAudio paths are rejected.
- [ ] #4 Recovery exhausts thread/timeline/list, detects cursor loops, and merges pages with live item events by stable identity without duplicate, hidden gap, or reordered turn.
- [ ] #5 appendText, appendSpeech, stop, and recovery revalidate captured child/epoch/thread/coordinator/session before one attempt; lost responses are outcome_unknown, uncertain approval falls back visual, and no path leaves awaiting_user.
- [ ] #6 src/runtime/codex-realtime/tests/adapter.test.ts drives decoded 0.151.0 fixtures through start, SDP, readiness, every item/thread/timeline event, paging/recovery, identity mismatch, lost response, stop, and cleanup, proving canonical transcript order and every closed failure outcome.
<!-- AC:END -->

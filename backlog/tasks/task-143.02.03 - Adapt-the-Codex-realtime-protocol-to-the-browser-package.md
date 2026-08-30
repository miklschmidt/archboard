---
id: TASK-143.02.03
title: Adapt the Codex realtime protocol to the browser package
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 15:48'
labels: []
dependencies:
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.02.01
  - TASK-143.02.05
  - TASK-143.07.01
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
Own the sole Archboard-to-package realtime binding adapter in `src/runtime/codex-realtime`. It consumes the stable Codex session port, binds one coordinator and package session, owns the authoritative realtime phase machine, and exposes guarded append and canonical transcript ports.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every start mints a unique realtimeSessionId; active requires RPC success plus matching thread/realtime/started for exact child epoch, coordinator thread, realtime session, and v3, and thread-only notifications are ignored outside the matching phase.
- [ ] #2 The phase machine serializes same-thread restart behind thread/realtime/stop and matching thread/realtime/closed before starting new package/session resources; child, coordinator, binding, device, and transport replacement have explicit recoverable or terminal outcomes.
- [ ] #3 Offer/answer, package events, appendSpeech, guarded developer appendText, stop, and disconnect map through one binding. Every append revalidates captured child/epoch/coordinator/session; unsupported output-audio WebSocket never crosses the boundary.
- [ ] #4 Canonical transcript is built only from matching thread/realtime/item/started, item/transcript/delta, and item/completed identities; flat transcript delta/done events may update ephemeral phase diagnostics but never create duplicate canonical text.
- [ ] #5 Tests in src/runtime/codex-realtime/tests cover non-v3/mismatch, pre-start/late notifications, stale append, stop/closed/restart ordering, canonical transcript dedupe, same-child recovery, child replacement, and package consumption through its public export.
<!-- AC:END -->

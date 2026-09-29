---
id: TASK-374
title: A retired coordinator thread is unloaded from the Codex child
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 12:31'
updated_date: '2026-09-29 12:50'
labels:
  - codex
  - voice
dependencies: []
priority: medium
type: bug
ordinal: 659000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Since TASK-301 a voice start replaces a coordinator that already carried a voice session. The retired coordinator thread is never driven again, but it stays loaded in the Archboard server's Codex child until the child restarts, so a long-running server accumulates one loaded coordinator thread per voice session. When the retired thread's last turn (the transcript-tail turn Codex starts after a session ends) is over, nothing needs it loaded.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 After a voice start replaces a coordinator, the retired thread is unloaded from the Codex child once no turn runs on it
- [ ] #2 A turn still running on the retired thread is not cut short by the unload
- [ ] #3 The unload uses a reviewed Codex app-server request, and a failed unload is reported without affecting the new voice session
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Review thread/unsubscribe as a Codex client request: CODEX_CLIENT_REQUEST_METHODS and CodexResponseByMethod (src/shared/codex-app-server-contract), param and response Zod schemas (src/runtime/codex-protocol), SESSION_PROTOCOL_METHODS (requestIdentities threadId, responseIdentities none) and a threadUnsubscribe session mutation behind the thread-capable gate (src/runtime/codex-session). Fixtures follow type-check; the production fake Codex answers {status: unsubscribed}.
2. Add src/runtime/codex-coordinator/lib/retire.ts. The coordinator tracks, from the notifications it already receives, which of the child's threads hold an open realtime session (thread/realtime/started until thread/realtime/closed). replaceOne starts retiring the old thread after the swap: it registers for the thread's thread/status/changed and realtime notifications first, then reads its status with thread/read; a status notification that arrives after registration wins over the read. It sends thread/unsubscribe once the realtime session is closed and the status is not active, so Codex unloads the thread after its idle delay and never cuts a turn short. No timers.
3. Reason for waiting on thread/realtime/closed: Archboard's realtime stop resolves on the thread/realtime/stop answer, and Codex starts or steers the transcript-tail turn before it sends thread/realtime/closed. An unsubscribe before that turn starts would leave its dynamic tool calls with no subscribed connection.
4. CoordinatorReplaceInput gains onRetired, which reports the outcome (the unsubscribe status or the failure). The voice start (codex-workbench-realtime-actions freshCoordinator) notes it in the voice start trace. A failure never touches the new coordinator.
5. Tests in src/runtime/codex-coordinator/tests/retire.test.ts: an idle retired thread is unsubscribed; a thread with a running turn and an open voice session is unsubscribed only after the session closes and the status goes idle, including a turn that starts while the read is in flight; an unsubscribe failure is reported and the new coordinator stays ready. Prove each fails without the change.
6. Board proposal Voice coordinator@TASK-374: the Coordinator thread part says the retired thread is unsubscribed once its voice session closed and no turn runs on it, and the call to Codex session names thread/unsubscribe. Codex session board: no change (it names method families, not methods). archboard-dev Codex bump section: no change (it points at methods.ts, not a list).
7. Gate: bun run check, lanes run separately if an early lane fails. Close with the proposal adopted and ./bin/dogfood check.
<!-- SECTION:PLAN:END -->

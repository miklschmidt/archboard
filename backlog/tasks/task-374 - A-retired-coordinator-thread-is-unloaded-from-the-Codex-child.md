---
id: TASK-374
title: A retired coordinator thread is unloaded from the Codex child
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 12:31'
updated_date: '2026-09-29 13:06'
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
- [x] #1 After a voice start replaces a coordinator, the retired thread is unloaded from the Codex child once no turn runs on it
- [x] #2 A turn still running on the retired thread is not cut short by the unload
- [x] #3 The unload uses a reviewed Codex app-server request, and a failed unload is reported without affecting the new voice session
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Codex 0.158.0 facts behind the design (codex-rs at rust-v0.158.0): thread/realtime/stop is answered once the close op is submitted (app-server turn_processor.rs:1369-1386), and the close path routes the transcript tail, which starts or steers a turn, before it sends thread/realtime/closed (core realtime_conversation.rs:1784-1808, 2723-2730). Archboard's realtime stop resolves on the stop answer (codex-realtime adapter.ts stop), so at replace time the tail turn may not have started. A server request of a turn goes only to subscribed connections (app-server outgoing_message.rs:170-181, 330-420), so the unsubscribe waits for thread/realtime/closed and a status that is not active. Codex itself unloads only an idle thread with no subscriber, after thread_unload_delay (thread_lifecycle.rs:56-119, 363-395).

Decisions: the retirement lives in src/runtime/codex-coordinator/lib/retire.ts. It follows thread/realtime/started and thread/realtime/closed for every thread of the current child, since a session opens before its retirement starts. A retirement registers first and then reads the thread with thread/read; a thread/status/changed that arrives after registration outranks the read, since every status change is notified. No timers. Only a replaced coordinator that was ready is retired. CoordinatorReplaceInput.onRetired is required and reports the unsubscribe status or the failure; the voice start notes it in the trace as coordinator_retired. threadUnsubscribe is a session mutation behind the thread-capable gate, like threadDelete.

Residual: Codex emits TurnStarted from the spawned turn task, so in principle it can reach the event stream after RealtimeConversationClosed (core tasks/mod.rs start_task, tasks/regular.rs:51). The spawned task emits it first thing, while the close path still awaits the fanout task, so this was not handled further. A turn that waits on an approval forever keeps the thread loaded, which the plan accepts. The production fake Codex answers thread/unsubscribe but sends no thread/realtime/closed, so no system test drives a retirement; the coordinator unit tests own it.

Validation: bun test src/runtime/codex-coordinator/tests (30 pass), each new retire.test.ts case proven failing by a mutation (no retire call: 4 fail; no voice-session guard: 1 fail; no active guard: 2 fail; read outranking notifications: 1 fail). bun run check exit 0: modules 3722 pass, system 182 pass, repository 8 pass, serial browser lane all pass. ./bin/dogfood check: no diagnostics.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A voice start that replaces the coordinator now retires the old thread. The coordinator waits until that thread's voice session has closed (thread/realtime/closed) and its status is not active, then sends the newly reviewed thread/unsubscribe, so Codex unloads the thread after its idle delay and keeps its rollout. A running turn is never cut short, because nothing is sent while the status is active and Codex itself never unloads an active thread. The outcome, or a failure, reaches the voice start trace through CoordinatorReplaceInput.onRetired and never touches the fresh coordinator. thread/unsubscribe is reviewed end to end (contract method list and response type, param and response schemas, session protocol entry, threadUnsubscribe session mutation, fixtures, production fake Codex). ADR 0019 carries a TASK-374 amendment. Voice coordinator@TASK-374 adopted. Verified with src/runtime/codex-coordinator/tests/retire.test.ts (idle thread unsubscribed; waits for the voice session to close and the tail turn to finish; a turn heard during the read outranks it; a failed unsubscribe is reported and the fresh coordinator stays ready), each proven failing by a mutation, bun run check (exit 0) and ./bin/dogfood check (no diagnostics).
<!-- SECTION:FINAL_SUMMARY:END -->

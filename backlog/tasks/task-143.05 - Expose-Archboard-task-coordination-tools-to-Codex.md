---
id: TASK-143.05
title: Expose typed task coordination tools to the bound Codex agent
status: To Do
assignee: []
created_date: '2026-08-30 13:07'
updated_date: '2026-08-30 14:18'
labels: []
dependencies:
  - TASK-143.01
references:
  - docs/design/desktop-app-server-sharing-research.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 165000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Give general Codex workhorse tasks started by Archboard one small typed task-coordination catalogue without another process or protocol. Archboard supplies an eager archboard_app namespace in thread/start.dynamicTools; calls return as typed item/tool/call requests on the same owned connection. The runtime validates server identity, applies target-state and user-approval policy, delegates operations, and returns DynamicToolCallResponse. Attached tasks without the exact manifest remain usable but report tools unavailable. The specialized voice coordinator namespace is a consumer of this routing framework and is specified separately.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The eager namespace is named archboard_app and contains exactly create_thread, fork_thread, list_threads, read_thread, send_message_to_thread, and wait_threads with strict JSON schemas. Its exact manifest and hash are supplied only in thread/start.dynamicTools for general Archboard-created tasks and their create_thread children. Voice coordinators instead receive the host-bound namespace owned by TASK-143.07; no title, archive, Desktop, browser, canvas, or voice-device operation is added here
- [ ] #2 Every invocation arrives only through the generated item/tool/call ServerRequest and trusts only its server-supplied threadId, turnId, callId, namespace, tool, and decoded arguments. The handler returns generated DynamicToolCallResponse with inputText content only; unsupported media and unknown namespace, tool, schema, or identity fail closed
- [ ] #3 A target-state matrix is encoded and tested: list_threads and read_thread may inspect persisted tasks without loading or mutating them; create_thread creates a new general Archboard task on the same child with exact shared instructions and the general manifest; fork_thread accepts only a source proven loaded, controllable, and Archboard-owned on that connection; send_message_to_thread accepts only a loaded controllable target on that connection and uses the target's idle, active, or queue policy explicitly; wait_threads observes only loaded tasks. Persisted notLoaded, unavailable, replacement-child, and cross-process targets are rejected wherever ownership is required
- [ ] #4 create_thread, fork_thread, and arbitrary send_message_to_thread pause before dispatch for an Archboard-owned browser approval naming caller, target, and effect. Decline returns a failed tool response and proves no mutation dispatch. List, read, and wait do not prompt. TASK-143.07's exact bound workhorse-coordinator callback and spoken-delegation policies are the only specialized send routes and are not app-server MCP approvals
- [ ] #5 send_message_to_thread and wait_threads reject a target that would re-enter the executing tool turn. A self-fork uses thread/fork with beforeTurnId equal to the executing turn; every fork omits model, cwd, approval, sandbox, developer-instruction, and other overrides so it inherits its source. A fork whose source cannot prove the exact general manifest is rejected
- [ ] #6 Cancellation before mutation dispatch declines pending approval or wait without side effects. After a create, fork, send, queue, or steer RPC is dispatched, cancellation cannot roll it back: resulting state remains visible and inspectable, the handler settles at most once, and shutdown or turn interruption releases only local waits and pending UI state
- [ ] #7 Task operations delegate to the typed workbench session and generated app-server thread, turn, queue, and event methods. The tool layer owns no task store, app-server process, project registry, worktree policy, MCP server, private socket, or second lifecycle state machine
- [ ] #8 A real-process test starts the exact configured Codex binary, starts a general task with the six tools, observes typed item/tool/call identity, exercises all tools, proves decline-before-dispatch, self-target refusal, inherited self-fork before the active turn, persisted-read behavior, every target-state failure, wait cancellation, and text-only output. Two children sharing one CODEX_HOME prove mutation, wait, fork, queue, and steer ownership isolation while list and read remain non-mutating
<!-- AC:END -->

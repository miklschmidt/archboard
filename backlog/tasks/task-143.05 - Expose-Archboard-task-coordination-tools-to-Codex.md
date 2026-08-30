---
id: TASK-143.05
title: Expose typed thread-coordination tools to Archboard-created Codex agents
status: To Do
assignee: []
created_date: '2026-08-30 13:07'
updated_date: '2026-08-30 14:36'
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
Give general Codex workhorse threads started by Archboard one small typed thread-coordination catalogue without another process or protocol. Archboard supplies an eager archboard_app namespace in thread/start.dynamicTools; item/tool/call requests return on the same owned connection. The runtime validates server identity, target ownership, approval freshness, and transitive wait safety before delegating to the typed session. Attached threads remain usable without gaining or replacing persisted dynamic tools. The specialized voice coordinator manifest and queue policy are specified separately.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The eager namespace is named archboard_app and contains exactly create_thread, fork_thread, list_threads, read_thread, send_message_to_thread, and wait_threads with strict JSON schemas. Its exact manifest and hash are supplied only at thread/start for Archboard-created general workhorse threads and their create_thread children. Attached threads never gain or replace persisted dynamic tools; voice coordinators receive the separate host-bound manifest owned by TASK-143.07.
- [ ] #2 Every invocation arrives only through the generated item/tool/call ServerRequest and trusts only its server-supplied threadId, turnId, callId, namespace, tool, and decoded arguments. The handler returns generated DynamicToolCallResponse with inputText content only; unsupported media and unknown namespace, tool, schema, or identity fail closed
- [ ] #3 A target-state matrix is encoded and tested: list_threads and read_thread may inspect persisted threads without loading or mutating them; create_thread creates a new general Archboard thread on the same child with exact shared instructions and the general manifest; fork_thread accepts only a source proven loaded, controllable, Archboard-owned, and manifest-matched on that connection; send_message_to_thread accepts only a loaded controllable target and uses its idle, active, attached, Archboard-created, and queue policy explicitly; wait_threads observes only loaded threads. Persisted notLoaded, unavailable, replacement-child, and cross-process targets are rejected wherever ownership is required.
- [ ] #4 create_thread, fork_thread, and arbitrary send_message_to_thread pause before dispatch for an Archboard-owned browser approval bound to child instance, caller thread and turn, target identity and current state token, and a canonical effect hash. Immediately before dispatch the runtime re-reads and revalidates target and effect; any change invalidates the approval and requires a new card. Decline or invalidation returns a failed tool response and proves no mutation dispatch. List, read, and wait do not prompt. TASK-143.07 owns only its exact bound coordinator routes.
- [ ] #5 The session owns a wait-for graph keyed by child, caller thread, turn and call. Before any dynamic operation waits on one or more target threads, it adds caller-to-target edges only if the resulting directed graph is acyclic; direct self-wait, two-node cycles, longer cycles, and edge sets containing any cycle fail before dispatch with an inspectable path. Edges are removed on settle, cancellation, interruption, disconnect, and child exit. A self-fork uses beforeTurnId equal to the executing turn and inherits without overrides.
- [ ] #6 Cancellation before mutation dispatch declines pending approval or wait without side effects. After a create, fork, send, queue, or steer RPC is dispatched, cancellation cannot roll it back: resulting state remains visible and inspectable, the handler settles at most once, and shutdown or turn interruption releases only local waits and pending UI state
- [ ] #7 Thread operations delegate to the typed workbench session and generated app-server thread, turn, queue, and event methods. The tool layer owns only request validation, the approval binding, and the lifetime-scoped wait-for graph; it owns no thread store, app-server process, project registry, worktree policy, MCP server, private socket, persisted ownership claim, or second lifecycle state machine.
- [ ] #8 A real-process test starts the exact reviewed 0.151.0 binary, starts a general thread with the six tools, observes typed item/tool/call identity, exercises all tools, proves approval revalidation and decline-before-dispatch, direct self-target refusal, two-node and three-node wait-cycle refusal with edge cleanup, inherited self-fork before the active turn, persisted-read behavior, every target-state failure, cancellation, and text-only output. Two isolated app-server ownership domains prove mutation, wait, fork, queue, and steer isolation while list and read remain non-mutating.
<!-- AC:END -->

---
id: TASK-143.03.02
title: Adapt Codex state with assistant-ui runtime providers
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-01 18:01'
labels: []
dependencies:
  - TASK-143.01.02
  - TASK-143.03.01
  - TASK-143.03.12
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-runtime
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 199000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Map authoritative Codex workhorse turns into assistant-ui through useExternalStoreRuntime and AssistantRuntimeProvider. Coordinator and inspect-only histories use ReadonlyThreadProvider; no assistant-ui transport or state owner is adopted.

Delegation profile: gpt-daybreak-blue-latest, low.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Only the executable current workhorse uses named root imports useExternalStoreRuntime and AssistantRuntimeProvider; coordinator and persisted/prior-epoch histories use ReadonlyThreadProvider, and MessageNotSentError is the sole additional runtime member.
- [ ] #2 No namespace/default/subpath import, assistant transport, thread-list, queue, tool handler, setMessages, edit/reload/delete control, assistant voice adapter, or unassigned export is used.
- [ ] #3 A canonical turn-keyed assistant record is created immediately from authoritative command/turn identity; there is no optimistic placeholder message that can become competing truth.
- [ ] #4 Module tests cover runtime failure, unsupported item mapping, stale turn, provider teardown, and reconnect, proving app-server authority is preserved and each path renders an explicit recoverable or inspect-only state.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Remediation plan after fixed-range review:
1. Replace the Promise<void> submit callback with a closed delivered/not_delivered/outcome_unknown result. Translate only not_delivered to MessageNotSentError; expose outcome_unknown without replay, and confirm delivered turnId against the current authoritative transport snapshot before showing success.
2. Add a typed provider render context carrying the actual assistant runtime identity for executable workhorses plus one semantic status contract for ready, read-only, failure, reconnect, stale, and submission outcomes. Render an accessible named role=status fallback with concrete recovery wording.
3. Preserve authoritative itemId on every mapped message part, reject missing or duplicate item identities across one timeline, and cover all seven media arms plus all four turn statuses through the public provider.
4. Replace helper-only lifecycle evidence with a mounted React client test using a module-owned minimal DOM harness and a child observer inside the real AssistantRuntimeProvider. Verify one subscription, stable runtime identity, reconnect, runtime failure, unsupported item, stale link/turn, transport replacement, teardown, no post-unmount render, and all onNew outcomes.
5. Run focused module/mounted tests, assistant-ui policy, relevant transport/socket/composition regressions, inventory, both TypeScript projects, build, lint, format, and diff checks sequentially under 6G/1G; record evidence and commit only owned paths plus the task record.

6. Remediation 2: fence every async submission to the exact transport generation; preserve stopped, incompatible_contract, backoff, reconnecting, and stale states/reasons; mount renderer observers as real provider descendants and assert public runtime state, identity, capabilities, TurnId, and ItemId; validate focused and repository gates without reopening the classified boundary OOM.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented src/ui/workbench-runtime as the sole assistant-ui runtime adapter. Each authoritative Codex turn maps to one deterministic assistant record keyed by turnId with no optimistic metadata. Supported text/reasoning/item states map losslessly into Archboard-owned parts; unknown items and duplicate identities become explicit recoverable records. Only a connected, thread-capable executable link mounts useExternalStoreRuntime under AssistantRuntimeProvider. Coordinator, inspect-only, prior-epoch, stale, reconnecting, unavailable, and runtime-failure histories use ReadonlyThreadProvider. The existing BrowserWorkbenchTransport remains the only snapshot subscription, reconnect, and command owner.

Validation under named transient user services with WorkingDirectory fixed to this checkout, MemoryMax=6G, and MemorySwapMax=1G: focused module 8 tests/26 assertions passed; assistant-ui import/dependency policy 12 tests/282 assertions passed; test inventory 39 tests/69 assertions passed; root and frontend TypeScript passed; frontend build passed; full Oxlint passed on 909 files; repository Oxfmt check passed on 991 files; git diff check passed. The repository boundary owner reproducibly reached the 6G memory and 1G swap caps after its first six cases passed, both alone and in the initial combined policy invocation; it was not retried. Existing task records document the same aggregate repository-policy OOM class at higher caps, so this is classified as a fixed-base resource failure, not a product assertion. No browser lane was claimed because TASK-143.03.13 owns rendered integration and this leaf adds no final shell composition.

Remediation 1 resolves the four accepted fixed-range findings. (1) WorkbenchRuntimeProvider.onSubmit now returns the closed delivered/not_delivered/outcome_unknown union. One onNew boundary throws MessageNotSentError only after producing not_delivered, publishes outcome_unknown with explicit inspect-before-resend guidance, never replays, and shows delivered only when the returned branded turnId exists in the current authoritative transport snapshot. Thrown callback errors become outcome_unknown. (2) Added a mounted React client owner using a module-owned minimal DOM harness and a render observer inside the actual AssistantRuntimeProvider. It proves one transport subscription, stable assistant runtime identity across snapshot updates and executable transport replacement, reconnect/stale/inspect-only demotion, replacement teardown, final unsubscribe, no post-unmount render, and all submission outcomes, including real composer draft restoration only for not_delivered. (3) Every mapped media part now carries the browser contract branded ItemId; duplicate item IDs fail across the whole timeline. Mounted coverage drives all seven media arms and all four turn statuses. (4) The provider now exposes a typed render context and always renders a named role=status message with visible state and concrete recovery wording; tests assert its accessible name and recovery text.

Remediation validation under 6G/1G named transient services: workbench-runtime 11 tests/53 assertions passed; workbench-transport 22/334; canvas workbench socket 5/63; production application sockets 2/40; composition policy 4/49; assistant-ui policy 12/282; inventory 39/69; root and frontend TypeScript passed; frontend build passed; full Oxlint passed on 911 files; repository Oxfmt passed on 993 files. The previously classified repository boundary owner OOM was not rerun. No browser inventory owner was added or claimed.

Remediation 2 fences every asynchronous submission settlement to a memoized transport-generation token updated at the layout boundary. A late result from replaced transport A returns before status publication or MessageNotSentError, so it cannot alter B's status or composer; mounted coverage exercises delivered, not_delivered, and outcome_unknown while retaining stable runtime identity. Snapshot-null stopped, incompatible_contract, and backoff preserve concrete state and exact reason; connected non-thread-capable readiness states also retain their state and reason when present, with state-specific recovery wording. The renderer is now mounted as a React component descendant of AssistantRuntimeProvider; its observer subscribes through the public assistant runtime and asserts observed messages, capabilities, authoritative TurnIds and ItemIds, plus stable/replaced runtime behavior. Focused runtime, exact assistant-ui policy, transport/socket/composition/inventory regressions, both TypeScript projects, frontend build, full lint, and repository format passed under named 6G/1G services.
<!-- SECTION:NOTES:END -->

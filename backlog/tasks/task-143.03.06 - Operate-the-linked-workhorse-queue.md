---
id: TASK-143.03.06
title: Operate the linked workhorse queue
status: Done
assignee:
  - '@claude-opus'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-04 10:34'
labels: []
dependencies:
  - TASK-143.03.01
  - TASK-143.07.02
  - TASK-144.19
  - TASK-144.14
  - TASK-143.08.05
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/agent-workbench-ui-library-research.md
modified_files:
  - src/ui/workbench-queue
  - src/ui/workbench-queue/tests
  - src/shared/codex-browser-model/lib/browser.ts
  - src/shared/codex-browser-model/tests/support.ts
  - src/shared/timing/timing.ts
  - src/shared/timing/tests/codex-workbench-policy.test.ts
  - src/server/codex-workbench/lib/contract.ts
  - src/server/codex-workbench/lib/gateway.ts
  - src/server/codex-workbench/lib/projection.ts
  - src/server/codex-workbench/lib/projection-contract.ts
  - src/server/codex-workbench/tests/queue-projection.test.ts
  - src/server/codex-workbench/tests/snapshot-budget.test.ts
  - src/server/canvas/lib/codex-workbench-browser-gateway.ts
  - src/server/canvas/lib/codex-workbench-browser.ts
  - src/server/canvas/tests
parent_task_id: TASK-143.03
priority: high
type: task
ordinal: 203000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own Archboard queue presentation and commands in `src/ui/workbench-queue`. This is owned source, not an assistant-ui Element; it consumes the exhaustive server snapshot and emits only legal add/edit/cancel/reorder/start commands.

Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The UI exposes Add, List/refresh, Edit, Cancel, Reorder, and Start; Edit emits queue update and Cancel emits queue delete, and no additional queue control exists.
- [x] #2 Empty, loading, running, queued, interrupted-preserved, approval-blocked, failed, restarted, completed, stale, reconnecting, unavailable, and outcome_unknown states show exact queue/workhorse correlation and recovery.
- [x] #3 Reorder submits all IDs and moves only coordinator-owned entries while preserving foreign relative order; no optimistic terminal/reorder state is committed, and authoritative reconciliation controls visible success.
- [x] #4 src/ui/workbench-queue/tests covers all six operations, keyboard/pointer reorder, focus, labels, disabled reasons, stale snapshots, refusal, uncertainty, and cross-links.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Build the closed module contract in src/ui/workbench-queue: exactly six controls (Add, List/refresh, Edit, Cancel, Reorder, Start) named as WORKBENCH_QUEUE_CONTROLS, with Edit bound to queueUpdate, Cancel bound to queueDelete, and List/refresh bound to the transport snapshot re-read because the gateway publishes no queueList browser command.
2. Write a pure projection over BrowserWorkbenchState plus transport capabilities that yields one view per AC #2 state (loading, empty, queued, running, interrupted-preserved, approval-blocked, failed, restarted, completed, stale, reconnecting, unavailable, outcome_unknown), each with exact queue/workhorse correlation (link state, thread id, thread status, active turn id and status, coordinator thread id) and one recovery sentence, plus per-control availability with a disabled reason.
3. Write a pure reorder planner: only coordinator-owned entries (entry.operationId is non-null) can move, foreign entries keep their absolute slots so their relative order is preserved, and the plan always yields the complete ordered submission id array. Cover keyboard step moves and pointer drop targets through the same planner.
4. Write the action layer over the transport captured-target API: every mutation passes the target captured when the queue was rendered, so a focus or link change refuses instead of retargeting. Settle each action from the authoritative command result and its snapshot only - delivered, refused with the gateway code, or outcome_unknown - and never commit optimistic terminal or reorder state.
5. Render the owned React surface (no assistant-ui import, no owner instantiation): a labelled queue region, one row per entry with position, ownership, submission id, correlated workhorse turn and coordinator operation cross-links, the six controls with accessible names and disabled reasons, keyboard reorder on the row, pointer drag-and-drop reorder, focus follow after a reorder, and a live region for settlement and uncertainty.
6. Cover it in src/ui/workbench-queue/tests with a local mounted DOM harness (the repository has no happy-dom or React Testing Library and TASK-143.03 serializes root dependency edits): projection states, reorder planning, action commands and refusal/uncertainty, and a mounted owner for keyboard/pointer reorder, focus, labels, disabled reasons and cross-links. Keep every test file under the 500-line lint cap.
7. Verify with bun run type-check, bun run lint, bun run fmt:check, bun run build:frontend, bun test --isolate over workbench-queue/transport/runtime, bun run test:repository, and bun run test:modules.

8. Remediation (orchestrator ruling, 2026-09-04): this task also owns the two serialized gateway-side edits the review named, kept to distinct functions from the concurrent TASK-143.03.03 thread-link work. (a) A browser snapshot request re-reads cached owner state before it is projected, through a new optional BrowserProjectionPort.refresh awaited by the gateway and the canvas wire handler, so transport.refresh() is a genuine read of the workhorse queue rather than a redraw of the pane's last command result. (b) The queue projection input carries, per entry, the Archboard OperationId that queued the submission, recovered from its clientUserMessageId, and the region status is derived from the authoritative thread link and its pending approvals instead of being hardcoded.
9. Give socket loss its own queue state and narrative, handle every readiness arm through an exhaustive typed map, remove the dead link-state clause, make the per-row copy say that ownership gates reordering alone, add an end-of-list pointer drop target, and split the settlement live regions by fixed politeness.
10. Replace the module's hand-written DOM with the repository's opt-in happy-dom and Testing Library harness once it lands, loaded through src/ui/dom-testing, and find every control by its accessible name.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented src/ui/workbench-queue as owned source (no assistant-ui import, no owner or socket instantiation). Module root: index.tsx (component plus pure surface), contract.ts (types), adapter.ts (pure runtime exports for the root TypeScript project, which excludes .tsx). Private lib: contract.ts, state.ts, projection.ts, reorder.ts, actions.ts, store.ts, WorkbenchQueue.tsx, QueueEntryRow.tsx, QueueRegionPanels.tsx. Tests: projection.test.ts, reorder.test.ts, actions.test.ts, mounted-queue.test.ts plus support.ts, mounted-dom.ts, mounted-support.ts.

Decisions recorded here rather than asked:

1. List/refresh is honest, not fabricated. The gateway publishes no queueList browser command, and its queue cache is bound to the thread it was read for and re-read on link mutation (TASK-143.01.10), so the authoritative list is already a field of every snapshot. The List control therefore calls transport.refresh() -- a recovery snapshot read -- and sends no queue command. actions.test.ts "List refreshes the authoritative snapshot and sends no queue command" and mounted-queue.test.ts "Start sends queue start and Refresh reads the snapshot without a command" pin that. Refresh stays enabled in every stale, reconnecting, restarted, unavailable and outcome_unknown state, because it is the recovery for all of them; the one state that disables it is a stopped socket.

2. Coordinator ownership is entry.operationId. A queue entry carries the DynamicToolCallId of the coordinator dynamic-tool call that queued it; a null identity is a submission Archboard's coordinator did not make. That is the only ownership fact the closed browser model publishes, and it is also the cross-link from a queue row to the coordinator.

3. "restarted" and "loading" are not wire statuses. Loading is the window before the first authoritative snapshot. Restarted is a child epoch that replaced the one the visible queue was presented for -- ADR 0019 voids every execution proof with the child, and the wire cannot spell that on its own because a snapshot from the new child looks ordinary. The presented child is remembered in the module's transport store (an external system), never in an effect or a render-time setState, and refreshing the list is how a person accepts the replacement.

4. Reorder moves only coordinator-owned entries. Each foreign entry keeps the absolute slot it already held, which preserves the foreign relative order exactly; coordinator-owned entries are permuted among the slots they already occupied; and the plan always names every submission in the queue, as the wire command requires. Keyboard steps and pointer drops go through the one planner.

5. No optimistic terminal or reorder state. The rendered order is the host's order, always. A reorder that the host refuses leaves the queue exactly as it was and shows the refusal; a new order appears only when the authoritative snapshot carries it. A lost outcome puts the whole region into outcome_unknown and holds every command until the list is refreshed.

6. Every mutation carries the target captured for the queue on screen, including queueAdd. The transport head that landed after this branch's base (dcd1583f) refuses queueAdd with link_required unless a captured target is passed; this module already captures the target with the observation that publishes the queue and passes it on every one of the five commands, so it satisfies both the base and the current transport contract.

7. Test harness. The repository ships no React Testing Library and no happy-dom, and TASK-143.03 serializes root dependency edits, so tests/mounted-dom.ts is a local DOM with real capture and bubble phases, focus, and drag data. It is test support inside this module's own tests folder; no root dependency, module inventory, shell, or browser-inventory file was touched. Every test file is under the 500-line cap (largest 456).

Interaction and accessibility: the row keeps list semantics and an inner plain container is the drag surface, so no non-interactive element carries handlers; the keyboard reorder path is the two move buttons (Enter/Space natively, ArrowUp/ArrowDown as a shortcut); disabled controls use focusableWhenDisabled so their reason is reachable, and every reason also appears in a per-row screen-reader summary; the region announces its state and its settlement through polite/assertive live regions.

Verification from the worktree: bun run type-check passed (both projects); bun run lint passed with 0 findings; bun run fmt:check reported all 1074 matched files correctly formatted; bun run build:frontend built dist/frontend in 453 ms; bun test --isolate src/ui/workbench-queue src/ui/workbench-transport src/ui/workbench-runtime passed 95 tests / 755 expectations across 13 files (workbench-queue alone: 54 tests / 242 expectations across 4 files); bun run test:repository passed 122 tests / 1060 expectations across 18 files; bun run test:modules passed 2020 tests / 18866 expectations across 224 files. No unrelated failures.

Acceptance criteria left unchecked and no final summary written: an independent reviewer runs first.

Review remediation, 2026-09-04. Rebased onto codex/task-143-144-workbench (badb5a60) before and again during the work; both rebases were clean.

Finding 1 (MAJOR, List/refresh freshness) — fixed on the server, then made the module copy match. BrowserProjectionPort gains an optional `refresh(context)`; the gateway awaits it through a new `connection.refreshProjection()`, and the canvas wire handler calls it in the `snapshot` case only. The canvas adapter implements it as `rereadLinkedQueue()`: for an executable link it re-runs `components.queue.list()` through `updateQueue`, and on a failed read it clears the cache so the browser is told the queue is unavailable rather than shown an unproven list. Unlike the link-mutation path it does not clear first, so a healthy queue never flickers. Owners: src/server/canvas/tests/codex-workbench-browser-queue.test.ts "a snapshot refresh re-reads the authoritative queue and replaces a stale cache" and "a failed re-read presents the queue as unavailable rather than an unproven list". The module's copy now says a refresh is a genuine re-read (lib/contract.ts WORKBENCH_QUEUE_CONTROLS, lib/actions.ts DELIVERED_MESSAGES.list and createWorkbenchQueueActions).

Finding 2 (MAJOR, ownership and statuses) — fixed. CodexQueueProjectionInput carries a per-entry `operationId: OperationId | null`, and the browser model's queue entry now types that field as OperationIdSchema rather than DynamicToolCallIdSchema, because an Archboard OperationId is what the host actually has. The canvas adapter recovers it from the submission's clientUserMessageId: the queue port sets that to the serialized OperationId on every add it makes, an OperationId is its own wire string, and the operation authority only recognises identities it issued in the current child epoch — so another client's submission, the workhorse's own, and a prior epoch's all resolve to null. Region status is derived from the authoritative thread link and that thread's pending approvals: unavailable, empty, queued, running, approval_blocked.

Statuses deliberately not produced at this seam, as the ruling allows: `interrupted`, `completed` and `failed` describe a workhorse turn, which the timeline owns — a submission that ran has already left the authoritative list, so the queue cannot report its outcome. `stale` and `reconnecting` are transport facts the browser transport already knows about its own stream and socket. `outcome_unknown` belongs to one command's settlement, which the gateway publishes as its own operation outcome. Two arms were considered and removed after the compiler proved them unreachable: an executable thread link is typed `Exclude<ThreadLinkStatus, "notLoaded" | "systemError">`, so there is no unloaded or errored link carrying a queue. The per-entry status axis has exactly one authoritative value — `thread/queue/list` answers with pending submissions only. The module still handles the other per-entry arms defensively because the closed contract admits them; those branches are unit-covered, not reachable from this producer. Owners: src/server/codex-workbench/tests/queue-projection.test.ts (six tests) and src/server/canvas/tests/codex-workbench-browser-queue.test.ts "a submission's coordinator operation is recovered from its client user message identity".

Finding 3 (MODERATE) — fixed. Socket loss is its own `disconnected` state, whose narrative says to reconnect the workbench and that refreshing cannot recover it; `unavailable` keeps the choose-a-link recovery. Owner: projection.test.ts "a lost socket is its own state, and the one that refreshing cannot recover".

Finding 4 (MODERATE) — fixed. Rows drop *before* the row they land on, so the region now renders an end-of-list drop target that emits `position = entries.length + 1`. Owner: mounted-queue.test.ts "dropping past the last row moves a submission to the end in one gesture".

Finding 5 (MINOR) — fixed. READINESS_STATES is an exhaustive `as const satisfies Record<Readiness, WorkbenchQueueState | null>`, so a new readiness arm fails type-check instead of falling through to an ordinary label. Owner: projection.test.ts "every readiness arm the host can publish has its own queue state".

Finding 6 (MINOR) — fixed; the dead second clause is gone (a non-executable link is unavailable, full stop).

Finding 7 (MINOR) — applied as ruled. Edit, Cancel and Start stay available on a foreign row, and the row's own correlation line now says so: "This pane can still edit, cancel or start it; only submissions this coordinator queued can be reordered." Owner: mounted-queue.test.ts "labels every control and states why a disabled one is disabled".

Finding 8 (MINOR) — superseded by finding 12; there is no dynamic-import cast left to enshrine, because the harness is now the repository's own.

Finding 9 (LOW) — fixed. The settlement is two regions with fixed politeness: a polite `output` for progress and success, and an assertive `role="alert"` for a refusal. Neither node changes its politeness.

Finding 10 (LOW) — moot: mounted-dom.ts is deleted. The largest test file in the module is now mounted-queue.test.ts at 401 lines.

Finding 11 (LOW) — fixed. Added "refreshing clears a lost outcome and puts every control back in reach" (the fake transport republishes on refresh, as the real one does), a focus assertion after a pointer drop, and the six-controls test now enumerates every interactive element in the region — buttons, links and fields — not only the data-attribute carriers.

Finding 12 (MAJOR, deferred) — done. mounted-dom.ts is deleted. tests/mounted-support.ts registers happy-dom and loads React Testing Library and user-event through src/ui/dom-testing's loadRenderedUiTools, never by static import. Clicks, typing and keyboard now run through real user gestures; controls are found with getByRole and the prompt fields by their accessible names. HTML5 drag and drop is dispatched directly, because user-event models pointers and keyboards but not DnD; that is the one gesture not driven by the library, and it is noted in the file. One label ambiguity surfaced and was fixed rather than worked around: the add panel's section was labelled by the same node as its field, so the section now carries its own aria-label.

Verification after remediation, from the worktree: bun run type-check passed (both projects); bun run lint passed with 0 findings; bun run fmt:check reported all 1078 matched files correctly formatted; bun run build:frontend succeeded; bun test --isolate src/ui/workbench-queue src/ui/workbench-transport src/ui/workbench-runtime passed 99 tests / 786 expectations across 13 files (workbench-queue alone 57 tests / 266 expectations across 4 files); bun test --isolate src/server/codex-workbench src/server/canvas passed 160 tests / 848 expectations across 31 files; bun run test:repository passed 122 tests / 1060 expectations across 18 files; bun run test:modules passed 2034 tests / 18920 expectations across 227 files; bun test --isolate --max-concurrency=1 tests/system/canvas-state/codex-workbench-production.test.ts tests/system/canvas-state/codex-workbench-application-sockets.test.ts passed 4 tests / 84 expectations. No unrelated failures.

Acceptance criteria remain unchecked and no final summary is written; the task stays In Progress for rereview.

Re-review remediation, 2026-09-04. Independent fixed-range review of badb5a60..aba4123b returned CLEAN apart from the readiness/connection copy, fixed in 2553e0f9.

Finding 1 (MODERATE, readiness mapped to a socket state) — fixed in 2553e0f9. A readiness transport state always arrives over a live socket, so mapping `stopped` and `incompatible_contract` to `disconnected` told a person the pane had no socket while List stayed enabled and nothing was marked stale. `disconnected` is now produced only by the connection owner's socket loss. The host's own session arms have their own states and narratives whose recovery agrees with the control that is actually offered: `session_stopped` ("This pane is connected, but the host's Codex session is not running" / "Refresh the list once the host's Codex session is running again") for readiness `stopped` and `storage_mismatch`, and `session_incompatible` ("...reports a contract it cannot serve" / "Install the pinned Codex version and restart the host session; refreshing will keep reporting this until then") for readiness `incompatible_contract`. Both are stale, so every command carries the recovery sentence as its disabled reason while List stays reachable. Owners in tests/projection.test.ts: "a stopped Codex session is not a lost socket, and refreshing is still offered", "an incompatible Codex session says a refresh will keep reporting it", "the same readiness word over a lost socket is disconnected, not a session state", and the extended "every readiness arm the host can publish has its own queue state".

Finding 2 (MINOR, running copy) — fixed in 2553e0f9. The region now reads "The linked workhorse is busy, so this queue is waiting behind the current turn." The authoritative list holds pending submissions only and the busy turn may be direct input, so the old wording claimed more than the host's facts support.

Finding 3 (MINOR, uncoalesced re-reads) — fixed in 2f5dfb9c. Concurrent snapshot re-reads share one in-flight `thread/queue/list` per thread link, and a request arriving inside CODEX_QUEUE_REREAD_FLOOR_MS (1,000 ms, added to src/shared/timing/timing.ts with its pulls-against reasoning and pinned by src/shared/timing/tests/codex-workbench-policy.test.ts) is served from the read that just finished. The floor is keyed to the link, so navigating to another workhorse always reads rather than reusing the previous link's timing. The constant sits at or above CODEX_WAIT_TARGET_POLL_MS — a browser must not out-run the cadence the host observes thread state at — and far below CODEX_REQUEST_SETTLEMENT_MS so a person's refresh still reads as immediate. Owner: src/server/canvas/tests/codex-workbench-browser-queue.test.ts "concurrent snapshot re-reads share one read, and a looping client is floored", with an injectable clock on the projection harness.

Known follow-ups for the coordinator, recorded rather than changed:

Observation 4 — the browser queue contract admits eleven per-entry statuses, and this seam can authoritatively produce exactly one. `thread/queue/list` answers with pending submissions only: a submission that started has become a turn and left the list, so `running`, `interrupted`, `failed` and `completed` describe turn state the timeline owns, not a queued entry. The UI keeps handling the other arms defensively because the closed contract admits them, and those branches are unit-covered rather than producer-reachable. Narrowing the per-entry status axis to what a producer can supply — or giving it a producer that correlates a started submission with its turn — is a contract decision above this leaf.

Observation 5 — ownership is recovered from an OperationId the current host process issued, so the ledger is per host-process lifetime. A submission Archboard queued before a canvas restart reads as foreign after it, and therefore becomes non-reorderable rather than mis-attributed. That fails safe and matches ADR 0019's rule that replacing the child voids every execution proof, but it does mean coordinator-owned entries are forgotten across a restart. Persisting the operation ledger, or accepting the restart as the boundary, is a decision for the queue-policy owner.

Final verification, from the worktree: bun run type-check passed (both projects); bun run lint passed with 0 findings; bun run fmt:check reported all 1078 matched files correctly formatted; bun run build:frontend built dist/frontend in 426 ms; bun test --isolate src/ui/workbench-queue src/ui/workbench-transport src/ui/workbench-runtime src/server/codex-workbench src/server/canvas src/shared/codex-browser-model passed 273 tests / 1770 expectations across 47 files (src/ui/workbench-queue alone 60 tests / 289 expectations across 4 files); bun run test:repository passed 122 tests / 1060 expectations across 18 files; bun test --isolate --max-concurrency=1 tests/system/canvas-state/codex-workbench-production.test.ts tests/system/canvas-state/codex-workbench-application-sockets.test.ts passed 4 tests / 84 expectations; bun run test:modules passed 2038 tests / 18949 expectations across 227 files. No unrelated failures.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:42
---
Course correction, 2026-09-02: divergent head 52b00a4d is not a merge candidate. Its 3,165 inserted lines and broad policy/test churn were built on the rejected browser contract after the OOM failures. Preserve only observable queue behavior as evidence and rebuild this UI leaf from the recovered base after TASK-143.08.05.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Built src/ui/workbench-queue as owned source: the closed six-control surface (Add, List/refresh, Edit, Cancel, Reorder, Start) over the exhaustive server snapshot, emitting only queueAdd, queueUpdate, queueDelete, queueReorder and queueStart, each against the target captured for the queue it drew so a link change refuses instead of retargeting. List/refresh is honest rather than invented: the gateway publishes no queueList command, so this task also took the serialized gateway edits it needed — a browser snapshot request now re-reads the authoritative queue before projecting (coalesced per link and floored by CODEX_QUEUE_REREAD_FLOOR_MS), and the queue projection carries the Archboard OperationId that queued each entry, recovered from its clientUserMessageId, with the region status derived from the authoritative thread link and its pending approvals. Reorder submits every submission id, moves only coordinator-owned entries and leaves foreign ones in their absolute slots; nothing commits an optimistic terminal or reordered state, and a lost outcome holds every command until a refresh. Every reachable state names its queue/workhorse correlation and one recovery sentence that agrees with the control it offers.

Verified with 60 module tests / 289 expectations in src/ui/workbench-queue (projection, reorder planning, command settlement, and a rendered owner on the repository's happy-dom and Testing Library harness driving keyboard, pointer, drag and focus by accessible name), plus the new server owners src/server/codex-workbench/tests/queue-projection.test.ts and src/server/canvas/tests/codex-workbench-browser-queue.test.ts. Full gates: bun run type-check, bun run lint (0 findings), bun run fmt:check (1078 files), bun run build:frontend, 273 tests / 1770 expectations across the queue, transport, runtime, gateway, canvas and browser-model modules, bun run test:repository (122 / 1060), bun run test:modules (2038 / 18949), and the two named canvas-state system owners (4 / 84). Two independent reviews: the first returned NOT CLEAN with twelve findings, all fixed; the fixed-range re-review of badb5a60..aba4123b returned CLEAN apart from the readiness/connection copy, fixed in 2553e0f9, with the re-read amplification floor in 2f5dfb9c. Two contract-level observations are recorded in the notes as follow-ups for the coordinator: the per-entry status axis admits eleven values but has one authoritative producer, and the ownership ledger is per host-process lifetime so a canvas restart makes prior Archboard entries read as foreign and therefore non-reorderable, which fails safe.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: TASK-143.03.06
title: Operate the linked workhorse queue
status: In Progress
assignee:
  - '@claude-opus'
created_date: '2026-08-30 15:09'
updated_date: '2026-09-04 09:32'
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
- [ ] #1 The UI exposes Add, List/refresh, Edit, Cancel, Reorder, and Start; Edit emits queue update and Cancel emits queue delete, and no additional queue control exists.
- [ ] #2 Empty, loading, running, queued, interrupted-preserved, approval-blocked, failed, restarted, completed, stale, reconnecting, unavailable, and outcome_unknown states show exact queue/workhorse correlation and recovery.
- [ ] #3 Reorder submits all IDs and moves only coordinator-owned entries while preserving foreign relative order; no optimistic terminal/reorder state is committed, and authoritative reconciliation controls visible success.
- [ ] #4 src/ui/workbench-queue/tests covers all six operations, keyboard/pointer reorder, focus, labels, disabled reasons, stale snapshots, refusal, uncertainty, and cross-links.
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
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:42
---
Course correction, 2026-09-02: divergent head 52b00a4d is not a merge candidate. Its 3,165 inserted lines and broad policy/test churn were built on the rejected browser contract after the OOM failures. Preserve only observable queue behavior as evidence and rebuild this UI leaf from the recovered base after TASK-143.08.05.
---
<!-- COMMENTS:END -->

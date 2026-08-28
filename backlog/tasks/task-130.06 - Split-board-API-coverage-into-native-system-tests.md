---
id: TASK-130.06
title: Split board API coverage into native system tests
status: To Do
assignee: []
created_date: '2026-08-28 01:04'
updated_date: '2026-08-28 05:15'
labels: []
dependencies:
  - TASK-130.01
  - TASK-086
references:
  - scripts/check-boards.mjs
  - TASK-086
  - docs/agents/test-suite.md
parent_task_id: TASK-130
priority: high
type: task
ordinal: 141000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
check-boards is 3,894 physical lines at the reviewed base. It combines HTTP, pane, note, conversion, malformed-input, recovery, branching, image, and scratch-board coverage. Convert it after TASK-086 lands so the native tests adopt the verified owned-canvas lifecycle instead of copying startup and teardown again.

Split by endpoint and state transition. Keep one owned canvas per group only where shared setup reduces runtime without creating order dependence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-boards is replaced by typed native system tests grouped by board lifecycle, element writes, pane state, conversion, malformed input, scratch-board behavior, and public HTTP refusals.
- [ ] #2 Every canvas started by the tests uses the TASK-086 lifecycle, verifies health.pid before assertions, retains stderr, reports early death, and leaves no child, listener, or vault on success or failure.
- [ ] #3 Tests preserve exact response statuses and bodies, note bytes, version behavior, frontend-sync tagging, conversion semantics, and malformed-telemetry diagnostics asserted by the legacy script.
- [ ] #4 No test depends on another test having run first; any intentionally shared canvas state is owned by one describe scope with explicit setup and teardown.
- [ ] #5 Every test source file is at most 500 lines and endpoint fixtures expose typed inputs rather than loose objects or computed module imports.
- [ ] #6 Representative route, conversion, scratch-board, and process-death mutations fail the native coverage before check-boards is deleted.
- [ ] #7 The native board system lane passes repeatedly without leaked processes, occupied ports, or changed authored vault files.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lifecycle ownership. Rebase after TASK-130.01 and preserve TASK-086 behavior. TASK-130.06 is the single owner that converts scripts/lib/canvas-test-process.mjs into narrow typed tests/system-owned support at tests/system/support/owned-canvas.ts. Add tests/system/support/owned-canvas.test.ts for the lifecycle contracts that TASK-086 proved. No other TASK-130 task may copy this helper, add a declaration-only shim, or defer its typing to TASK-130.11.

2. Typed contract. owned-canvas.ts accepts explicit serverPath, port, vault, and environment inputs and returns one typed handle with base, vault, pid, stderr, assertRunning, restart, and idempotent dispose. It preserves exact health.pid ownership, early-death and stderr reporting, serialized restart/dispose, bounded SIGTERM then owned-child SIGKILL, signal cleanup, response-body death detection, listener exit waiting, and vault removal. All duration imports remain in src/shared/timing/timing.ts. The native lifecycle tests prove success, assertion or fetch failure, interruption, early death after headers, foreign PID refusal, and restart/dispose races without leaked processes, ports, or vaults.

3. Board conversion and cutover. Every native board system test in TASK-130.06 imports this tests/system-owned support. After old/new parity, the reconciliation owner serially maps the existing package.json test:boards key to the complete native board test file list, deletes scripts/check-boards.mjs and scripts/lib/canvas-test-process.mjs, and runs the real TASK-130.02 inventory. TASK-130.11 only consolidates final lane names and removes other remaining non-check MJS. It does not migrate or delete this lifecycle helper.

4. Consumer boundary. TASK-130.04 and TASK-130.07 depend on TASK-130.06. Their route and repository-session tests import tests/system/support/owned-canvas.ts directly as same tests/system-owner support. They do not own fallback process code. TASK-130.06 must land its typed helper, lifecycle tests, package mapping, and predecessor deletion before either dependent task integrates.

5. Validation and serialization. Author disjoint native board files as allowed, but serialize package.json, lifecycle migration, check-boards deletion, and integration through the reconciliation owner. Run the owned-canvas focused tests, every TASK-130.06 board test, bun run type-check, bun run lint, bun run fmt:check, bun run check, and git diff --check sequentially. Acceptance requires no reference to scripts/lib/canvas-test-process.mjs and no live child, listener, or vault after success or forced failure.

6. Inventory ordering. Native board files may be authored earlier on disjoint paths, but no TASK-130.06 native test lands until TASK-130.02 has made the real-checkout inventory live. Integrate the complete native board set, the existing test:boards package mapping, check-boards and old-helper deletion, and lifecycle ownership transfer as one serialized unit. Run full sequential validation before the next task integrates.

7. Exact board mapping under 500 physical lines. Source inspection confirms scripts/check-boards.mjs is 3,894 physical lines at the reviewed base, correcting the former 3,549-line count. Create these tests/system-owned files under tests/system/boards, with one exclusive observable contract group per file:
- tests/system/boards/board-lifecycle.test.ts owns create, open, reload, list, normalized identity, registry-without-content, and snapshot behavior.
- tests/system/boards/element-writes.test.ts owns replacement writes, element IDs, exact note results, frontend-sync tagging, and board version behavior.
- tests/system/boards/image-persistence.test.ts owns per-board images, image behavior across branches, embedded-file hydration, and one-reader parity.
- tests/system/boards/pane-addressing.test.ts owns pane registration, selection, open and close, viewport, and ordinary board switching.
- tests/system/boards/branching.test.ts owns save-as, compare and promote, variant stamping, and pane movement caused by branching or promotion. Ordinary pane switching remains only in pane-addressing.test.ts.
- tests/system/boards/conversion.test.ts owns Mermaid conversion and all write-boundary converter behavior.
- tests/system/boards/malformed-input.test.ts owns finite-number validation, malformed note and geometry input, settlement before refusal, exact diagnostics, and exact board or note non-mutation.
- tests/system/boards/scratch-board.test.ts owns scratch home, graceful restart persistence, and killed-process persistence.
- tests/system/boards/held-board-recovery.test.ts owns foreign note edits, stopped-saving state, reload, overwrite, save-elsewhere recovery, and pane notification.
- tests/system/boards/public-http-refusals.test.ts owns board/pane addressing and authority refusals not assigned to another file: absent or unopened board, unqualified element/save/clear/files requests, unknown or unnamed pane, pane-capacity refusal, and board-name collision. It owns the exact status, body, and unchanged-state assertions for those cases only. Missing-doing coverage remains exclusively in TASK-130.08; malformed, conversion, branching, scratch, and held-board refusals remain with their named files.
No contract case is duplicated between these files. When a scenario crosses mechanics, the file that owns the observable outcome owns the full assertion.

Keep tests/system/support/owned-canvas.test.ts beside tests/system/support/owned-canvas.ts. Under tests/system/boards/support, permit only:
- tests/system/boards/support/http.ts for typed request execution, response-body capture, child-liveness checks, and failure diagnostics. It contains no expected status, body, byte, or ordering assertions.
- tests/system/boards/support/pane-websocket.ts for typed WebSocket connection, pane registration, event capture, open and close mechanics, and bounded event waits. It contains no expected event order or state-transition assertions.
Do not add a board scenario helper, assertion framework, shared expected-value table, or lifecycle helper under tests/system/boards/support. No separate authored TypeScript fixture file is planned. Typed request and expected-value fixtures stay in the owning test.

After parity, map package.json test:boards exactly to:
bun test tests/system/support/owned-canvas.test.ts tests/system/boards/board-lifecycle.test.ts tests/system/boards/element-writes.test.ts tests/system/boards/image-persistence.test.ts tests/system/boards/pane-addressing.test.ts tests/system/boards/branching.test.ts tests/system/boards/conversion.test.ts tests/system/boards/malformed-input.test.ts tests/system/boards/scratch-board.test.ts tests/system/boards/held-board-recovery.test.ts tests/system/boards/public-http-refusals.test.ts

Run that identical command as focused validation before bun run type-check, bun run lint, bun run fmt:check, bun run check, and git diff --check. Every listed test, tests/system/support/owned-canvas.ts, owned-canvas.test.ts, both tests/system/boards/support files, and any later approved authored TypeScript fixture must stay at or below 500 physical lines. The repository max-lines rule must enforce the limit. A fixture extraction or contract move that changes this exclusive map requires plan rereview before dispatch or implementation.
<!-- SECTION:PLAN:END -->

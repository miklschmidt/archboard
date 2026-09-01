---
id: TASK-143.01.15
title: Verify the composed Codex lifecycle across reload and shutdown
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 16:25'
updated_date: '2026-09-01 14:41'
labels: []
dependencies:
  - TASK-143.01.14
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/server/canvas/lib/codex-workbench-approvals.ts
  - src/server/canvas/lib/codex-workbench-lifecycle.ts
  - src/server/canvas/lib/codex-workbench-production.ts
  - tests/system/process-contracts/codex-workbench-lifecycle.test.ts
  - tests/system/process-contracts/codex-workbench-storage.test.ts
  - tests/system/process-contracts/support/codex-workbench-lifecycle.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 245000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the one real-process lifecycle and protocol owner for the production Codex composition seam. It tests public server behavior against controlled exact-version and clean-home processes; it does not instantiate an alternate graph. Delegation profile: gpt-5.6-sol, medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A clean restrictive home proves config.toml materialization, initialize.codexHome, config origin and sqlite_home, managed-requirement reconciliation, account readiness, one executable link, and canonical OperationId issuance; env-only or null, redirected, symlink, and conflicting stores refuse.
- [ ] #2 The process owner drives all eleven server-request variants through the exhaustive production router, including whole-second currentTime/read and exact token-refresh and attestation errors, with no dropped or double response.
- [ ] #3 Through public ports it covers all six general tools, their confirmed, partial, and uncertain results, two-home isolation, general and coordinator dynamic calls, seven ordinary approval families, and fresh create, fork, and send visual approvals across approve, decline, expiry, cancellation, browser disconnect, stale revalidation, and terminal approval_required without resume. Module owners retain exhaustive fake-port matrices.
- [ ] #4 Reload during in-flight RPC, ordinary reverse requests, dynamic approval, and wait preserves one child, listener, coordinator, queue, broker, gate, and replaceable handler set. Browser disconnect, child exit, signals, and normal close settle or classify every request, release wait edges, invalidate effect authority, and leave no orphan or later mutation.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add one self-contained real-process owner at tests/system/process-contracts/codex-workbench-lifecycle.test.ts. Drive the production Codex installation against controlled 0.151.0 executables and isolated restrictive homes; prove accepted storage setup and refusal of every conflicting store shape through public startup.
2. Exercise the installed production transport router and public gateway across all eleven reverse-request variants, general and coordinator dynamic calls, ordinary and dynamic approval outcomes, and exact one-response ownership. Reuse existing production contracts and helpers; do not create an alternate composition graph.
3. Exercise reload and terminal boundaries with RPC, approvals, waits, disconnect, child exit, signals, and normal close in flight. Assert one retained child/kernel, fresh volatile handlers, complete settlement, no late mutation, and no leaked process or temporary state.
4. Run the new owner first, then sequential memory-capped type, lint, formatting, inventory, boundary, and diff checks. Self-review the fixed-base range, record objective evidence, commit task-owned changes, and finalize only after every acceptance criterion is proven.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Scope correction from direct verification: the true Bun reload owner exposed two reachable production defects. Reload rebuilt the coordinator without its retained persisted settings, and fork/send approval projection passed raw Codex identities into authority-bound browser schemas. The implementation now carries coordinator persistence into replacement generations and adopts mutation thread/turn identities before browser projection.

The real-process owner is split into lifecycle, storage/isolation, and shared controlled-fixture files so the repository max-lines rule remains enforced. It still drives the one production composition graph and creates all derived fixture executables only under temporary roots.

Validation evidence before review: composed owner 3 pass/83 expectations; targeted lifecycle, coordinator reuse, and browser model modules 45 pass/241 expectations; existing production composition and cleanup 6 pass/95 expectations; main and frontend TypeScript pass; full lint and format check pass; repository inventory 39 pass. The standalone generic and Codex boundary policy owners exceeded their 6 GiB memory scope and were OOM-killed; the full lint boundary enforcement passed, and no rule was disabled or weakened.
<!-- SECTION:NOTES:END -->

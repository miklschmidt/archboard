---
id: TASK-143.01.15
title: Verify the composed Codex lifecycle across reload and shutdown
status: To Do
assignee: []
created_date: '2026-08-30 16:25'
updated_date: '2026-08-31 14:27'
labels: []
dependencies:
  - TASK-143.01.14
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - tests/system/process-contracts/codex-workbench-lifecycle.test.ts
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

---
id: TASK-143.01.10
title: Expose the Codex workbench browser gateway
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 18:34'
labels: []
dependencies:
  - TASK-143.01.02
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.01.16
  - TASK-143.01.21
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/server/codex-workbench
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 180000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose the closed browser gateway for account and session readiness, thread links, timelines, settings, queue, ordinary and dynamic approvals, text commands, semantic status, and realtime control. The gateway leases commands and projects the distinct dynamic coordination approval DTO, but owns no Codex state reducer, approval policy, or mutation executor. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Browser state distinguishes child stopped or backoff, initialized, storage mismatch, login capable, signed out, login pending, account ready, thread capable, and reconnecting without enabling commands early.
- [ ] #2 A renewable app-global command lease binds browser, pane, link, child epoch, and command id; navigation or focus changes do not retarget a pending ordinary or dynamic approval, and expiry produces one visible refusal.
- [ ] #3 Account read, login, cancel, and logout are available before account readiness; all thread, turn, item, queue, tool, realtime, ordinary approval, and dynamic coordination approval operations require composed thread capability and the exact current link. Dynamic responses preserve OperationId, logical call identity, and effect hash.
- [ ] #4 Reconnect snapshots and sequenced deltas are idempotent and bounded. Tests cover stale sequence, duplicate command, lost response, late result, lease transfer, dynamic approval expiry or disconnect, terminal approval_required without resume, child exit, browser close, and recovery.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define the server-root gateway contract and narrow injected ports for lifecycle/readiness, session operations, current thread-link CAS, ordinary approvals, dynamic coordination approvals, queue, semantic, coordinator, and realtime projections; keep browser DTO validation at the shared model boundary and expose only bounded JSON-safe results. 2. Implement app-global browser connection and renewable command-lease ownership, binding each lease to browser, pane, captured link, current child epoch, and command id; enforce exact lease/link/capability checks, deterministic expiry/refusal, duplicate and late-command handling, and lease transfer/close recovery without retargeting pending approvals. 3. Compose readiness/account/thread/timeline/settings/queue/approval/dynamic/semantic/coordinator/voice projections on demand from injected owners, route account commands before account readiness, gate all thread-scoped operations on thread capability plus exact current link, and preserve dynamic OperationId/logical-call/effect-hash DTOs through pending-aware response validation. 4. Add focused gateway tests for all reachable readiness and recovery states, command and lease races, ordinary and dynamic approval lifecycles, bounded snapshots/sequenced idempotent deltas, stale and duplicate inputs, child/browser disconnect, lost/late outcomes, and exact capability/link enforcement. 5. Run scoped gateway tests, strict TypeScript, Oxlint, Oxfmt, diff and path audits under sequential named 6G/1G transient user units; record evidence and commit only src/server/codex-workbench plus the Backlog record, leaving acceptance criteria unchecked for independent review.
<!-- SECTION:PLAN:END -->

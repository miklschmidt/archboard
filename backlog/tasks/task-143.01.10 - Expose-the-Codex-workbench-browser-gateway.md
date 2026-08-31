---
id: TASK-143.01.10
title: Expose the Codex workbench browser gateway
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 14:27'
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

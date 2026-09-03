---
id: TASK-143.01.10
title: Expose the Codex workbench browser gateway
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-09-03 22:41'
labels: []
dependencies:
  - TASK-143.01.02
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.01.16
  - TASK-143.01.21
  - TASK-143.08.05
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
1. Extend the existing browser projection disconnect seam with exact connection retirement, thread it through the canvas gateway, and discard timeline state on close/replacement without introducing another lifecycle owner.
2. Replace raw SessionTurn retention with bounded compact owner presentations, require the method-bound timelineListPage cursor, cap final items after approval interleaving, and enforce one below-1 MiB timeline budget with injectable tiny limits for focused tests.
3. Add focused regression coverage for close-then-notify, bounded ingestion/item/aggregate output, required cursor, stale links, notification recovery, and run the exact existing owners plus type, lint, format, boundary, inventory, and diff checks; commit separately and leave acceptance criteria unchecked.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Remediation ready for independent review: childExit now makes the gateway terminal and recovery uses a newly constructed authority; wrapper arms are exact; in-flight and bounded settled command retention are separate and evicted IDs cannot execute. Focused gateway tests: 29 pass and 147 assertions. Backend and frontend TypeScript, scoped Oxlint, Oxfmt check, repository inventory, and diff checks pass. Acceptance criteria intentionally remain unchecked; task remains In Progress.

Async settlement remediation complete: disconnect owners now run independently after synchronous authority revocation, pending settlement promises are drained by browser close, exact child exit, and dispose, and lifecycle child-exit listeners are awaitable. Rejection policy is best effort after all owners receive a chance to settle. Final focused gateway suite: 36 pass and 197 assertions. Both TypeScript graphs, scoped Oxlint, Oxfmt check, repository inventory, and diff checks pass. Acceptance criteria remain unchecked and task remains In Progress.

Finalization evidence: AC #1 is proved by the closed readiness and capability-gate tests. AC #2 is proved by renewable app-global lease, exact link binding, non-retargetable approvals, and expiry or transfer tests. AC #3 is proved by account pre-readiness coverage, every route owner, exact capability and link checks, and preserved dynamic identity fields. AC #4 is proved by bounded snapshots, strict sequenced delivery, duplicate and stale handling, command retention, approval_required, disconnect, recovery, and lifecycle-drain tests. The complete BASE..HEAD range is review-clean. The documented combined repository-policy run remains preserved as capped-OOM and was not rerun.

Reopened with user approval after TASK-143.03.03, TASK-143.03.06, and TASK-143.03.07 exposed hardcoded or missing browser projections in the production gateway.

Live browser timeline producer implemented. A single canvas owner reads bounded typed thread-turn pages with full item view, obtains only the opaque timeline cursor from the session boundary, maps the seven reviewed presentation arms plus exact item-bound ordinary approvals, strips NULs, bounds text/cursors/items, and caches per pane/link/capability. Stale link loads are discarded; matching raw transport notifications are correlated through the trusted identity serializer; failed refreshes recover on a later matching event. The existing gateway projection receives the owner output and production lifecycle disposes it with the generation; no browser DTO builder, second reducer, or mutation path was added. Evidence: 70 focused tests and 435 assertions passed across timeline, gateway, projection, generation, recovery, and production-initialization owners; root and frontend TypeScript, scoped Oxlint/Oxfmt, repository boundary/inventory policy, and diff checks passed. No broad, browser, or full check lane ran. Acceptance criteria remain unchecked and the task remains In Progress.

Remediation implementation complete: the existing gateway notifyDisconnect seam now synchronously retires projection state with the exact browser connection identity, including replacement, close, child-exit, and shutdown paths; the canvas adapter passes that identity into timeline reads and retirement. The timeline owner projects and bounds each source turn during ingestion, retains only compact owner presentation data, requires the typed thread/timeline method pair, caps final approval-interleaved items, and enforces one bounded turn/item/byte budget (production ceiling 768 KiB, injectable tiny limits in focused owners). Focused remediation owners prove close-then-notify produces no retained read/publication, reject source inspection beyond a tiny item limit, use timeline/list's cursor, preserve matching approval chronology while omitting unmatched overflow, and stay within a 5 KiB aggregate budget. Evidence: 67 focused gateway/timeline/projection/generation tests and 407 assertions passed; 61 repository boundary/inventory tests and 132 assertions passed; both TypeScript graphs, scoped Oxlint/Oxfmt, and diff checks passed. No broad, browser, system, performance, or capacity lane ran. Acceptance criteria remain unchecked and task remains In Progress.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
created: 2026-09-02 01:39
---
Course correction, 2026-09-02: 8bac86bf is a Backlog-only blocker record with no unique product change. Fold its useful context into recovery and drop it after its head is durably referenced; it receives no replay.
---
<!-- COMMENTS:END -->

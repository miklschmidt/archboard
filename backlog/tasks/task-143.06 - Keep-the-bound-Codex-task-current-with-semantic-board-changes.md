---
id: TASK-143.06
title: Keep the linked workhorse thread current with semantic board changes
status: To Do
assignee: []
created_date: '2026-08-30 13:34'
updated_date: '2026-08-30 14:50'
labels: []
dependencies:
  - TASK-143.01
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 168000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the legacy environment-routed control-socket injector with one semantic-context publisher on the owned workbench app-server session. The existing change feed remains the source of compact human board-change narration. A pane's explicit thread link supplies the only automatic history target; its active linked voice coordinator receives the same event through realtime developer context. The agent stays current without polling, while no ambient Desktop, daemon, recent-thread heuristic, or configured thread id participates.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A compact settled human or mixed-origin board change is delivered quietly to the exact controllable workhorse bound to that pane through the same owned app-server connection without starting a turn; agent-only changes are never narrated back to their author
- [ ] #2 When that thread link has an active voice coordinator, the same semantic event is also rendered once as developer-role realtime context. Focus and selection changes use their separate ephemeral context channel; stopping voice ends coordinator delivery and the next start receives a fresh semantic brief rather than replaying every idle delta
- [ ] #3 No current-epoch controllable workhorse, unavailable or prior-epoch thread link, lease loss, or child exit produces no delivery and exposes an inspectable reason. Replacement-child state never inherits proof or silently resumes workhorse or coordinator delivery.
- [ ] #4 Legacy ARCHBOARD_INJECT configuration, standalone control-socket discovery, thread-route environment variables, loud injection experiment, injection status and test surface, and obsolete docs are removed rather than retained as a second path
- [ ] #5 The runtime owns one typed semantic-context publisher and one compact narration per change. Workhorse history injection, active realtime developer context, fresh voice startup brief, and typed Archboard turns consume that publisher without introducing a second board snapshot, thread selector, or lifecycle state machine
- [ ] #6 Deterministic module, process, and browser tests prove debounce, significance filtering, exact workhorse routing, active-coordinator fan-out, stopped-coordinator exclusion, no polling, self-injection refusal, unbound, unavailable and prior-epoch refusal, child-exit invalidation, and isolation between two owned app-server sessions in separate dedicated Codex and SQLite homes.
- [ ] #7 A direct end-to-end check moves a board element through the real browser and proves the semantic update reaches only the bound workhorse and its active linked coordinator over the owned app-server while the board remains responsive
<!-- AC:END -->

---
id: TASK-143.06.01
title: Publish one semantic Archboard context stream
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:08'
updated_date: '2026-08-30 23:24'
labels: []
dependencies:
  - TASK-143.01.01
  - TASK-143.01.16
references:
  - docs/adr/0005-push-to-codex-via-app-server.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-semantic-context
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 190000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publish one semantic Archboard context stream and explicit typed subscriptions for settled board change, pane focus, pane selection, and on-demand fresh brief. It reuses the existing change-feed settle boundary and owns no second timer.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Public ports expose settled semantic change events, immediate pane-focus events, immediate pane-selection events, and an on-demand fresh-brief query with board/pane/version/cursor/freshness identity.
- [ ] #2 Existing change-feed settle/debounce remains the sole semantic coalescing timer; the publisher filters agent-only/cosmetic noise and never snapshots a second board document.
- [ ] #3 Brief generation is deterministic, bounded to realtime limits, marks truncation/ambiguity/staleness, and includes repository/workhorse/coordinator/board/pane/version/selection/claim/doing/cursor/compact description.
- [ ] #4 Module tests prove each port independently, source classification, rapid focus/selection without settle delay, fresh on-demand reads, and no duplicate subscription/timer after reload.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the existing semantic change-feed settle boundary, pane focus/selection sources, shared identity/timing, and frozen realtime context limits.
2. Implement one instance-scoped semantic-context publisher with explicit settled-change, immediate focus, immediate selection, and on-demand fresh-brief ports, reusing the existing settle timer and canonical board truth.
3. Add deterministic module tests for every port, source/noise filtering, rapid focus and selection, freshness, bounded truncation/ambiguity, reload-safe subscription lifetime, and absence of duplicate timers or board snapshots.
4. Run focused publisher tests, complete module and repository lanes, both TypeScript projects, lint, format, diff and clean-status checks; record evidence without finalizing before independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parallel reservation at integration HEAD 863ec41 after removing the unjustified worker/reviewer caps: TASK-143.06.01 is dependency-ready and path-disjoint from all active work. It is dispatched now; later thread delivery remains dependency-gated on the instruction/session/link owners.

Implementation ready for review at commit 9853ff65fb967d08f6cc1f8ef5f3cff5b98c3e05.

Decision: the publisher consumes the existing settled-feed callback and exposes one typed pane-signal adapter for immediate focus and selection; it owns no settle timer, board elements, or document snapshot. Fresh context is read only when requested. UTF-8 limits, cursor qualification, ambiguity, staleness, and immutable deterministic payloads are enforced in the module.

Validation: focused publisher tests 7/7; bun run type-check; bun run lint; bun run fmt:check; bun run test:modules (1,020/1,020); bun run test:system (284/284); bun run test:repository (130/130); bun run test:serial-browser (all listed owners passed); git diff --check clean.

Scope: only src/runtime/codex-semantic-context/** plus this task record. Task status, assignment, dependencies, acceptance criteria, and final summary were not changed.
<!-- SECTION:NOTES:END -->

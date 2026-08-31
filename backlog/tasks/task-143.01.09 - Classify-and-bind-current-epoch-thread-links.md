---
id: TASK-143.01.09
title: Classify and bind current-epoch thread links
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 13:05'
labels: []
dependencies:
  - TASK-143.01.05
  - TASK-143.01.08
  - TASK-143.01.17
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-thread-link
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 179000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fully discover, classify, and bind one current-epoch pane thread link by joining paginated persisted thread rows with paginated loaded thread IDs. No loaded-list response is treated as a Thread object.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The classifier exhausts thread/list and thread/loaded/list, joins loaded IDs to Thread rows by exact ThreadId, and never infers membership from recency, status, or a partial page.
- [ ] #2 Execution requires current child/epoch, literal top-level source cli|vscode|exec|appServer, loaded membership, and canAcceptDirectInput === true; custom/subAgent/unknown sources and false/null capability have distinct refusal reasons.
- [ ] #3 Persisted-not-loaded, notLoaded, systemError, stale child, prior epoch, unknown provenance/source, absent join row, and outcome-unknown creation remain inspect-only with actionable reasons.
- [ ] #4 Bindings compare-and-swap pane/link identity and tests cover cursor exhaustion, repeated cursors, disappearing rows, duplicate IDs, stale responses, all four allowed sources, all refused source variants, and every refusal.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define the thread-link public contract around the typed CodexSession page results, current child/epoch provenance, and authored additional-context reason/source/status rules.
2. Implement deterministic full-page discovery for thread/list and thread/loaded/list with repeated-cursor detection, exact ThreadId joins, duplicate/disappearing-row refusal, and frozen refusal precedence; expose inspect-only outcomes for all non-executable cases.
3. Add compare-and-swap pane/link binding keyed by captured child epoch, pane identity, and link identity, with stale-response refusal and no recency inference.
4. Add focused module tests for pagination/cursor failure, exact joins, source/status/direct-input matrix, epoch/provenance/outcome-unknown cases, and binding CAS races; run only named capped focused validation and record evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the public codex-thread-link module: typed full-page thread/list plus thread/loaded/list classification, exact ThreadId joins, authored refusal precedence, current child/epoch and operation provenance checks, and a frozen CAS pane binding store with live-epoch stale-response refusal. Added 23 focused module tests covering every refusal reason and binding race. Validation: oxfmt, oxlint, and tsc pass; focused module lane passes (23/23). The targeted repository boundary/inventory command was started but the cgroup terminated it at the 6 GB cap during the heavy boundary suite before inventory ran.
<!-- SECTION:NOTES:END -->

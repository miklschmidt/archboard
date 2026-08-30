---
id: TASK-143.07
title: Orchestrate voice through a fast linked coordinator thread
status: To Do
assignee: []
created_date: '2026-08-30 14:13'
updated_date: '2026-08-30 15:16'
labels: []
dependencies:
  - TASK-143.01
  - TASK-143.05
  - TASK-143.06.01
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/agent-workbench-ui-library-research.md
  - docs/design/codex-workbench-delivery-map.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 169000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integration milestone for coordinator lifecycle/settings, queue policy, bound workhorse operations, callbacks, state-gated spoken approvals, and coordinator-specific dynamic tools delivered by TASK-143.07.01-.06.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One same-epoch capable coordinator persists per valid thread link, validates Luna/medium and priority fallback, retains ordinary tools/approvals, and delegates sustained work while allowing quick investigation and one explicit board write.
- [ ] #2 Exactly four host-bound workhorse operations plus the typed spoken resolver enforce queue/attached-busy/intervention policy without caller-selected targets or a wait tool.
- [ ] #3 Callbacks are correlated, buffered, non-reentrant, and delivered through inactive inject-items or exact current active realtime appendText.
- [ ] #4 The spoken gate uses the later normal coordinator turn, one global slot, stored effect/description, exact session binding, state/effect compare-and-swap, and explicit visual fallbacks/race disclosure.
<!-- AC:END -->

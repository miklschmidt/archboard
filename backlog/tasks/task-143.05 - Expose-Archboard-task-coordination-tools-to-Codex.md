---
id: TASK-143.05
title: Expose typed thread-coordination tools to Archboard-created Codex agents
status: To Do
assignee: []
created_date: '2026-08-30 13:07'
updated_date: '2026-08-30 15:16'
labels: []
dependencies:
  - TASK-143.01
references:
  - docs/design/desktop-app-server-sharing-research.md
  - docs/design/codex-workbench-delivery-map.md
parent_task_id: TASK-143
priority: high
type: feature
ordinal: 165000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Integration milestone for the pure wait graph, approval broker, exact six-tool manifest, and general `item/tool/call` dispatcher delivered by TASK-143.05.01-.04.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 General Archboard-created workhorse threads receive exactly the six reviewed `archboard_app` tools; attached threads never gain or replace persisted dynamic tools.
- [ ] #2 The dispatcher enforces server identity, target availability/ownership, discriminated approval freshness, exact effect revalidation, cancellation semantics, and transitive wait-cycle refusal before app-server effects.
- [ ] #3 Real-process tests cover all tools, every target state, exact-once text results, cancellation, cycles, self-fork, prior-epoch refusal, and two-home isolation.
<!-- AC:END -->

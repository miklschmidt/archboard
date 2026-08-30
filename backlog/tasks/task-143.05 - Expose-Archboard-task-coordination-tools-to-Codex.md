---
id: TASK-143.05
title: Expose typed thread-coordination tools to Archboard-created Codex agents
status: To Do
assignee: []
created_date: '2026-08-30 13:07'
updated_date: '2026-08-30 17:27'
labels: []
dependencies: []
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
Integration milestone for the pure wait graph, seven-family approval broker, exact reviewed six-tool manifest, and general item/tool/call dispatcher. Milestone ordering is expressed only by leaf dependencies to avoid a cycle with the final TASK-143.01 composition root.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 General Archboard-created workhorse threads receive exactly the six reviewed archboard_app tools; attached threads never gain or replace persisted dynamic tools.
- [ ] #2 The dispatcher enforces the literal target-state matrix, approval freshness, exact effect revalidation, pagination/cursor contracts, cancellation, and transitive wait-cycle refusal before effects; module fake-port tests exhaust every matrix cell.
- [ ] #3 TASK-143.01.15 owns composed real-process coverage for all six tools and two-home isolation; TASK-143.05 leaves own pure graph, broker, manifest, dispatcher, and fake-port policy coverage only.
<!-- AC:END -->

---
id: TASK-148.13
title: Move performance and tooling owners out of normal gates
status: To Do
assignee:
  - '@codex'
created_date: '2026-09-03 17:33'
labels: []
dependencies:
  - TASK-143.08.05
references:
  - package.json
  - tests/system/browser/run-browser-lane.ts
  - docs/agents/test-suite.md
  - AGENTS.md
  - TASK-148.12
  - TASK-143.08.05
parent_task_id: TASK-148
priority: high
type: task
ordinal: 285000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Developers and CI need fast, dependable feedback from the normal test gates. Separate retained long-running performance, stress, concurrency-measurement, and test-infrastructure/tooling owners from normal development and CI gates, while retaining short browser owners that directly catch user-visible product regressions.

Classify every existing browser owner by its concrete regression and cheapest credible interface. Remove or merge redundant, obvious, and tool-only owners instead of simply relocating them. The normal and opt-in inventories must be complete for their declared scopes, statically disjoint, and documented. Record the runtime removed from normal iteration through direct verification, without adding a performance gate merely to prove the speedup.

Implementation must wait for TASK-143.08.05 and for reconciliation of the active TASK-148.12 runner candidate because both touch the browser-runner seam.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Normal development and CI gates exclude long performance, stress, concurrency-measurement, and test-infrastructure/tooling owners.
- [ ] #2 Retained excluded owners run only through a clearly named opt-in suite or command.
- [ ] #3 Every existing browser owner is classified by its concrete regression and cheapest credible interface; short owners that catch real user-visible product regressions are retained unless the classification shows a cheaper sufficient owner.
- [ ] #4 Redundant, obvious, and tool-only browser owners are removed or merged rather than merely relocated.
- [ ] #5 No test exists solely to prove normal-suite speed improvement or browser-runner concurrency.
- [ ] #6 Normal and opt-in inventories are statically disjoint, complete for their declared scopes, and documented.
- [ ] #7 Direct verification records the runtime removed from normal iteration without introducing a slow performance gate.
<!-- AC:END -->

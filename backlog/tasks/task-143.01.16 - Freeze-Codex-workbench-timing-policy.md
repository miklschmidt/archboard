---
id: TASK-143.01.16
title: Freeze Codex workbench timing policy
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 16:25'
updated_date: '2026-08-30 22:20'
labels: []
dependencies:
  - TASK-143.01.17
references:
  - src/shared/timing/timing.ts
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/shared/timing/timing.ts
  - src/shared/timing/tests/codex-workbench-policy.test.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 246000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own every new Codex workbench duration in the existing shared timing module. The task records what each bound pulls against so later workers consume names instead of inventing local timers. Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The shared module exports exactly the twelve authored millisecond values: restart base 1000/max 30000, request settlement 30000, browser lease 150000, approval 90000, spoken gate 60000, semantic freshness 30000, realtime start 15000/stop 3000/recovery 45000, TERM grace 5000, and composed shutdown 10000.
- [ ] #2 Comments preserve the authored expiry classifications, exponential-backoff reset rule, and shutdown order; no consumer defines a numeric duration locally or supplies an override.
- [ ] #3 src/shared/timing/tests/codex-workbench-policy.test.ts proves base <= max, wait cap < browser lease, approval < browser lease, spoken <= approval, semantic freshness < realtime recovery, realtime stop < TERM grace, and realtime stop + TERM grace < composed shutdown.
- [ ] #4 Legacy injection timing names remain until the later serialized TASK-143.06.07 removal, which must not change any accepted workbench duration.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the twelve reviewed Codex workbench durations and their pull-against rationale with the existing shared timing module, retaining all legacy injection timing names.
2. Export exactly the twelve named millisecond constants with authored expiry classifications, exponential-backoff reset rule, and realtime-first shutdown order documented beside the values.
3. Add the module-owned policy test for every exact value and all required inequalities, plus repository-visible checks that prevent local consumer duration literals or override hooks.
4. Run focused timing tests, module and repository gates, both TypeScript projects, lint, format, diff, and clean-status checks without changing consumers or performing TASK-143.06.07 cleanup early.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Batch reservation at integration HEAD 7e0c8ae: newly ready scoped leaves are exactly TASK-143.01.07 and TASK-143.01.16, with disjoint runtime/codex-instructions and shared/timing ownership. TASK-143.01.13 remains active on the protocol/package seam, so three of four leaf-worker slots are occupied. Slot 4 is intentionally unused because no other TASK-143/TASK-144 leaf is ready; all other ready scoped entries are parent containers and remaining leaves are dependency-blocked. TASK-141/TASK-142 remain unrelated CI-restoration bugs.
<!-- SECTION:NOTES:END -->

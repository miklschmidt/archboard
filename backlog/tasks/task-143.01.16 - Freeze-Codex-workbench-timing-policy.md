---
id: TASK-143.01.16
title: Freeze Codex workbench timing policy
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 16:25'
updated_date: '2026-08-30 22:51'
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
- [x] #1 The shared module exports exactly the twelve authored millisecond values: restart base 1000/max 30000, request settlement 30000, browser lease 150000, approval 90000, spoken gate 60000, semantic freshness 30000, realtime start 15000/stop 3000/recovery 45000, TERM grace 5000, and composed shutdown 10000.
- [x] #2 Comments preserve the authored expiry classifications, exponential-backoff reset rule, and shutdown order; no consumer defines a numeric duration locally or supplies an override.
- [x] #3 src/shared/timing/tests/codex-workbench-policy.test.ts proves base <= max, request settlement <= restart max, request settlement < browser lease, approval < browser lease, spoken <= approval, semantic freshness < realtime recovery, realtime stop < TERM grace, and realtime stop + TERM grace < composed shutdown.
- [x] #4 Legacy injection timing names remain until the later serialized TASK-143.06.07 removal, which must not change any accepted workbench duration.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the twelve reviewed Codex workbench durations and their pull-against rationale with the existing shared timing module, retaining all legacy injection timing names.
2. Export exactly the twelve named millisecond constants with authored expiry classifications, exponential-backoff reset rule, and realtime-first shutdown order documented beside the values.
3. Add the module-owned policy test for every exact value and all required inequalities, plus repository-visible checks that prevent local consumer duration literals or override hooks.
4. Run focused timing tests, module and repository gates, both TypeScript projects, lint, format, diff, and clean-status checks without changing consumers or performing TASK-143.06.07 cleanup early.

5. Keep the public wait-cap relationship in TASK-143.05.03, whose public timeout schema owns that contract and depends on this timing policy; this leaf enforces only its owned module relationships.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Batch reservation at integration HEAD 7e0c8ae: newly ready scoped leaves are exactly TASK-143.01.07 and TASK-143.01.16, with disjoint runtime/codex-instructions and shared/timing ownership. TASK-143.01.13 remains active on the protocol/package seam, so three of four leaf-worker slots are occupied. Slot 4 is intentionally unused because no other TASK-143/TASK-144 leaf is ready; all other ready scoped entries are parent containers and remaining leaves are dependency-blocked. TASK-141/TASK-142 remain unrelated CI-restoration bugs.

Implemented the twelve CODEX_* workbench timing exports in src/shared/timing/timing.ts with authored classifications, pull-against comments, restart backoff/reset policy, and realtime-first shutdown order. Added src/shared/timing/tests/codex-workbench-policy.test.ts with exact values, required inequalities, exact CODEX_* export-set enforcement, and legacy injection-name retention checks. Focused test: 3 pass, 11 expectations; fmt, both TypeScript projects, lint, and diff check pass.

Added the explicit authored 120,000 ms wait-cap < browser-command-lease assertion; focused policy test now passes 3 tests with 12 expectations, and the final type, lint, format, and diff checks remain green.

Review remediation scope: add request settlement <= restart max with a 29,999 fail-first boundary probe. Remove the test-only public wait-cap literal and route that relationship to TASK-143.05.03, which owns the public timeout schema. This is a reviewed dependency correction, not a waived test.

Remediation validation: focused policy test 4 pass, 15 expectations, including the 29,999 restart-max fail-first mutation; test:modules 997 pass, 0 fail, 6,990 expectations across 75 files; test:repository 122 pass, 0 fail, 381 expectations across 10 files; both TypeScript projects, lint, format, and diff check pass. Final review scope keeps the public wait-cap relationship in TASK-143.05.03.

Final cleanup correction: the permanent matcher self-test was deleted. The earlier remediation note claiming 4 tests/15 expectations and a permanent 29,999 guard is superseded. The final owner is 3 tests/12 expectations. A disposable source-plus-REVIEWED_VALUES mutation to max 29,999 passed the exact-value golden comparison and failed the direct exported settlement <= restart-max relationship with Expected <= 29999, Received 30000.

Parent integration at f5c5e84 preserved the separate b0806ec TASK-143.05.03 routing commit and passed direct acceptance verification: focused timing owner 3 tests/12 expectations; complete module lane 1,013 tests/7,046 expectations across 76 files; complete repository lane 130 tests/415 expectations across 11 files; both TypeScript projects, Oxlint, Oxfmt on 520 files, diff check, and clean status. The same independent reviewer returned REVIEW_CLEAN at exact worker HEAD 2575c61615e6acce6710ca057def3223485ecd3a after reproducing the disposable 29,999 source-plus-golden failure through the direct exported relationship.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the twelve exact Codex workbench timing constants and their authored lifecycle rationale to the shared timing module while retaining legacy injection durations. Added exact export/value/relationship enforcement, including the direct settlement <= restart-max policy, and routed the public wait-cap relationship to its owning TASK-143.05.03 schema. Verified by independent review-clean audit, the disposable 29,999 mutation, 1,013 module tests, 130 repository-policy tests, both TypeScript projects, lint, formatting, and clean integration status.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: TASK-143.05
title: Expose typed thread-coordination tools to Archboard-created Codex agents
status: Done
assignee: []
created_date: '2026-08-30 13:07'
updated_date: '2026-09-03 22:05'
labels: []
dependencies:
  - TASK-143.08.05
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
- [x] #1 General Archboard-created workhorse threads receive exactly the six reviewed archboard_app tools; attached threads never gain or replace persisted dynamic tools.
- [x] #2 The dispatcher enforces the literal target-state matrix, approval freshness, exact effect revalidation, pagination/cursor contracts, cancellation, and transitive wait-cycle refusal before effects; module fake-port tests exhaust every matrix cell.
- [x] #3 TASK-143.01.15 owns composed real-process coverage for all six tools and two-home isolation; TASK-143.05 leaves own pure graph, broker, manifest, dispatcher, and fake-port policy coverage only.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Establish the pure lifetime-scoped wait graph with deterministic cycle detection and exact lifecycle cleanup.
2. Define the seven-family human-interaction approval broker and the exact eager six-tool archboard_app manifest.
3. Route the six general tool calls through the dispatcher and its fake-port policy, enforcing literal target-state, approval, cursor, cancellation, and wait-cycle rules at module boundaries.
4. Verify composed real-process behavior through TASK-143.01.15, including partial and uncertain outcomes, two-home isolation, approvals, and lifecycle.
5. Finalize this roll-up only after every direct child and TASK-143.08.05 are Done and objective evidence proves each parent acceptance criterion.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Finalization audit at ea09607c: TASK-143.05.01/.02/.03/.04 are Done with no descendants; their final evidence covers the pure wait graph, seven-family broker, eligible-start-only six-tool manifest, dispatcher, and exhaustive fake-port policy. TASK-143.01.15 is Done and its checked AC #3 plus final summary provide composed real-process coverage for all six tools, partial and uncertain results, two-home isolation, approvals, and lifecycle. Dependency TASK-143.08.05 is Done. No extra test run was needed because these accepted owners directly prove the roll-up criteria.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Finalized the six-tool coordination roll-up. Completed leaf evidence proves the wait graph, approval broker, exact eligible-start manifest, and fail-closed dispatcher policy; TASK-143.01.15 provides the separate composed real-process coverage for all six tools, partial and uncertain outcomes, two-home isolation, approvals, and lifecycle.
<!-- SECTION:FINAL_SUMMARY:END -->

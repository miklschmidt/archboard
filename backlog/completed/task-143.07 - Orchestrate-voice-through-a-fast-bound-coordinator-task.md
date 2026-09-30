---
id: TASK-143.07
title: Orchestrate voice through a fast linked coordinator thread
status: Done
assignee: []
created_date: '2026-08-30 14:13'
updated_date: '2026-09-03 22:05'
labels: []
dependencies:
  - TASK-143.08.05
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
Integration milestone for byte-exact coordinator/voice catalogues, capable Luna/medium coordinator lifecycle/settings, sole queue port, four bound workhorse operations, correlated callbacks, one-slot later-turn spoken approval gate, and dynamic-call dispatcher. Ordering is expressed by leaves.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One current-epoch capable gpt-5.6-luna medium coordinator starts with reviewed bytes/catalogues, normal Codex tools/approvals, fully proven settings, and priority only when advertised.
- [x] #2 Exactly four host-bound workhorse operations plus spoken resolver enforce created/attached/busy/queue/steer policy without caller targets, synchronous wait, or duplicate turn on uncertainty.
- [x] #3 Callbacks use one closed correlated union and select one guarded active append or eligible inactive injection after dequeue; semantic callbacks stay silent while voice is inactive.
- [x] #4 The spoken gate schedules a later ordinary coordinator turn and codex-approvals alone settles the validated request exactly once, with visual fallback for every race/uncertain state.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Bind the current-epoch coordinator to the reviewed gpt-5.6-luna medium host profile, freeze the authoritative workhorse and voice catalogues, and prove the exact start/settings handshake, ordinary capabilities, and advertised-only priority through TASK-143.07.01 and TASK-143.07.07.
2. Expose one closed queue and workhorse port for inspect, delegate, queue management, and steer, route the spoken resolver through the gate, and preserve host-owned correlations plus one-attempt outcome_unknown settlement through TASK-143.07.02, TASK-143.07.03, and TASK-143.07.06.
3. Deliver the closed correlated callback union after dequeue through exactly one guarded active append or eligible inactive injection, while leaving inactive semantic callbacks silent, through TASK-143.07.04.
4. Capture one eligible spoken approval, schedule one later ordinary coordinator classifier turn, and let only codex-approvals settle the validated request once with deterministic visual fallback through TASK-143.07.05.
5. After TASK-143.08.05 and all seven leaves are Done, run the smallest existing composed owners for the coordinator lifecycle, dispatcher, and callbacks; map their recorded and current evidence to AC1-AC4, then finalize the roll-up.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parent roll-up finalization at fixed HEAD ea09607c5fcc8e177f9e334428c4fe2e212ebcdb. Direct children TASK-143.07.01 through TASK-143.07.07 and dependency TASK-143.08.05 are Done; no leaf has descendants. Current composed validation passed: bun test --isolate src/runtime/codex-coordinator/tests src/runtime/codex-coordinator-tools/tests src/runtime/codex-coordinator-callbacks/tests, 84 tests and 998 expectations. AC1 maps to .01 lifecycle/model/reuse plus .07 frozen catalogue evidence; AC2 maps to .02 queue policy, .03 four bound operations, and .06 dispatcher routing/replay evidence; AC3 maps to .04 callback routing and exact-byte evidence; AC4 maps to .05 spoken-gate evidence and .06 resolver/fallback routing. Each leaf records independent REVIEW_CLEAN and focused validation; known capped-OOM broad lanes remain documented and were not rerun.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed the coordinator and voice orchestration roll-up. All seven leaves and the recovery dependency are Done; current lifecycle, dispatcher, and callback composition tests passed 84 tests with 998 expectations, and the completed leaves provide the reviewed catalogue, queue, operation, callback, and spoken-approval evidence for AC1-AC4.
<!-- SECTION:FINAL_SUMMARY:END -->

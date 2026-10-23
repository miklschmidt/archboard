---
id: TASK-512
title: Keep server route board layouts within the existing render budgets
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-23 03:14'
updated_date: '2026-10-23 03:30'
labels: []
dependencies: []
ordinal: 919000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The normal TASK-511 gate reproduces a renderer regression on the updated Archboard server routes board. Track takes 3451 ms against its 3000 ms budget. Blocks times out after 20000 ms. Existing layout guarantees and timeouts stay intact.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Both layouts render the complete server-routes board within their existing test budgets.
- [ ] #2 Existing routing clarity and semantic completeness assertions remain intact.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board is affected: existing layout engine, block placement and trunk router keep their roles and connections. Disable optional quadratic unification preprocessing while retaining normal nudging and every clarity assertion. For Track, choose the stacking option using partial solves before starting the selected full layout, removing speculative whole solves. Reject cache and local-loop experiments that showed no material speedup. Run the complete renderer suite and keep original time budgets, then run the complete repository gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Deterministic loop: bun test packages/renderer/tests/runtime/operations/blocks/wide-boards.test.ts --test-name-pattern "Archboard server routes". Baseline before correction route node: Track3007ms; updated board Track3476ms. In-process CPU profile for Blocks:56.1s over8 solves, one libavoid transaction dominates44.6s. Scratch Router proxy disabling performUnifyingNudgingPreprocessingStep reduces the same complete drawing to12.1s. Upstream source orthogonal.cpp shows quadratic pairs of free segments and repeated VPSC solves; official documentation describes disabling this optional preprocessing for large examples. It leaves normal nudging enabled. https://www.adaptagrams.org/documentation/namespaceAvoid.html. Track profile shows repeated Graphviz and channel search work across9 solves.

Successful focused owner: Track1630ms, Blocks4417ms, all17 assertions pass, original3000ms and20000ms bounds unchanged. Removed speculative whole-layout tasks and abort-controller state, reducing the implementation. Cache-sharing and small chain-loop experiments showed no material gain and were reverted. Blocks optional preprocessing disabled globally; normal nudging stays enabled. Complete corpus still required.

Opus 5.5 high review found that globally disabling unification squeezed two pairs of Agent workbench trunks. The repair uses existing LANE and SAME geometry rules to detect parallel runs below the required spacing, then enables unification only for the chosen final packing. Discarded packing candidates keep the fast route. Original lane owner passes in 851 ms; complete server-routes owners pass at Track1712 ms and Blocks7922 ms. No assertions or budgets changed. Complete corpus and gate pending.
<!-- SECTION:NOTES:END -->

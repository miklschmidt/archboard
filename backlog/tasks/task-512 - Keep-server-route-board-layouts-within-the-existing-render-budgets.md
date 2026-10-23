---
id: TASK-512
title: Keep server route board layouts within the existing render budgets
status: Done
assignee:
  - '@codex'
created_date: '2026-10-23 03:14'
updated_date: '2026-10-23 03:53'
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
- [x] #1 Both layouts render the complete server-routes board within their existing test budgets.
- [x] #2 Existing routing clarity and semantic completeness assertions remain intact.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board is affected: layout engine, block packing and trunk routing retain their roles and relationships. Choose stacking from partial solves before starting one selected full solve. Route packing candidates without optional unification, then use it only when the selected packing violates existing lane spacing. Preserve every assertion and timeout. Run renderer corpus, Opus review and the full repository gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Deterministic loop: bun test packages/renderer/tests/runtime/operations/blocks/wide-boards.test.ts --test-name-pattern "Archboard server routes". Baseline before correction route node: Track3007ms; updated board Track3476ms. In-process CPU profile for Blocks:56.1s over8 solves, one libavoid transaction dominates44.6s. Scratch Router proxy disabling performUnifyingNudgingPreprocessingStep reduces the same complete drawing to12.1s. Upstream source orthogonal.cpp shows quadratic pairs of free segments and repeated VPSC solves; official documentation describes disabling this optional preprocessing for large examples. It leaves normal nudging enabled. https://www.adaptagrams.org/documentation/namespaceAvoid.html. Track profile shows repeated Graphviz and channel search work across9 solves.

Successful focused owner: Track1630ms, Blocks4417ms, all17 assertions pass, original3000ms and20000ms bounds unchanged. Removed speculative whole-layout tasks and abort-controller state, reducing the implementation. Cache-sharing and small chain-loop experiments showed no material gain and were reverted. Blocks optional preprocessing disabled globally; normal nudging stays enabled. Complete corpus still required.

Opus 5.5 high review found that globally disabling unification squeezed two pairs of Agent workbench trunks. The repair uses existing LANE and SAME geometry rules to detect parallel runs below the required spacing, then enables unification only for the chosen final packing. Discarded packing candidates keep the fast route. Original lane owner passes in 851 ms; complete server-routes owners pass at Track1712 ms and Blocks7922 ms. No assertions or budgets changed. Complete corpus and gate pending.

Final Opus 5.5 effort-high review approves the spacing repair, with documentation fixes in f03f8df28. Renderer corpus passes709 tests,1skip. Complete bun run check passes at f03f8df28:4890module,257system,136repository and19browser owners. Server restart succeeds. Post-adoption behind review: Renderer layout responsibilities for Layout engine, Block packing, Trunk router and Block layout remain accurate. Commits8b9169126 and604f3be0d change internal solve selection and optional routing preprocessing, not board parts or relationships.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Restored the original server-route render budgets while preserving lane spacing and completeness. Removed redundant solves and limited expensive unification to crowded final packings. Opus5.5 high approved the repair. Renderer corpus and complete repository gate pass.
<!-- SECTION:FINAL_SUMMARY:END -->

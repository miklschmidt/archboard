---
id: TASK-506
title: Renderer keeps routes and labels clear around nested implementation parts
status: Done
assignee:
  - '@codex'
created_date: '2026-10-22 03:28'
updated_date: '2026-10-22 04:32'
labels: []
dependencies: []
references:
  - TASK-501
  - packages/renderer/tests/runtime/operations/blocks/wide-boards.test.ts
priority: high
type: bug
ordinal: 913000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TASK-501 normal gate exposed two renderer failures when current boards gained responsibility-based bound children. Agent workbench with Track leaves label 2wlebJ2T off its own route. Browser application with Blocks routes four relationships through the five new cards inside Semantic viewer. The unchanged wide-board owner fails both clearance contracts. Fix the renderer rather than changing board meaning or weakening assertions. Full gate log: /tmp/archboard-task501-check.log. Isolated reproduction: bun test --isolate packages/renderer/tests/runtime/operations/blocks/wide-boards.test.ts --test-name-pattern with Agent workbench track and Browser application blocks. Remaining normal lanes run under the TASK-501 monitor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Track keeps the Agent workbench publication label on its own route after the nested owner is drawn
- [x] #2 Blocks routes Browser application relationships clear of the cards inside a container endpoint
- [x] #3 Focused renderer owners and the complete normal gate pass without weakening clearance, timing, or coverage contracts
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Diagnose and minimize the two observed clearance failures, then repair their existing routing seams. Keep public behavior and board meaning unchanged. No architecture board is affected by the internal rendering correction. Run the focused repro after each relevant fix, then the complete normal gate after the repairs.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The minimized Track regression first failed on detached label 2wlebJ2T. The cause was cycle detection ignoring title-to-member ordering. The minimized Blocks regression first failed on ZDhACWtE crossing TY7m2mtd. The cause was a side port inside the obstacle clearance of a packed container. The repairs include only semantic container ordering and side clearance in PackLayout. An initial broader inset experiment changed card layouts and was removed. Five targeted regression and existing routing cases now pass in 1.98 seconds. Source lint and full corpus validation remain in progress.

Implementation commit fe3510df3 keeps the existing renderer modules and contracts. Renderer layout still describes Block layout, Block packing, and Card blocks correctly. Its three stale renderJSON anchors now cite the current renderString call in card-layout.ts. This corrects existing board evidence and changes no drawn architecture. No proposal or public model change is required.

The second renderer group passed 206 cases and found one remaining Board viewer Track wall hug. A minimized 30-node input reproduced qu6pVEXF beside the inner frame of a lone group region. Routing read the outer region walls while the final frame stands one region inset inside them. Scene.frameWalls now reports the drawn inner walls. The original full Board viewer geometry probe reports no card, label, or wall failures. The existing wide-board owner already catches this exact regression, so no duplicate large fixture is added. The supported renderer group is running to assess all geometry and timing contracts.

The final supported renderer group passed all 207 tests across 34 files, with 2,005 assertions and zero failures in 100.68 seconds. Log: /tmp/archboard-task506-final-renderer.log. This includes both original wide-board failures, the later Board viewer wall regression, and all existing clearance, lane, and timing assertions. The complete normal gate is next.

The complete gate passed type-check and every wide-board case, then found two focused routing regressions among 4,870 module tests. Both fixtures contain authored cycles among children without a relationship to their parent. The first cycle change altered their traversal root and selected different return edges. CycleWalk now preserves authored cycle choices first, then adds containment ordering and finds only the extra constraints. All 18 focused rank, route, and label cases pass in 1.44 seconds, and targeted source lint passes. No assertions or deadlines changed. The remaining normal lanes from the failed gate are running before the next complete run.

The next complete gate had one remaining Agent workbench label crossing a container edge. The two-pass ranking preserved child cycles but overconstrained other return edges. The simpler final mechanism uses the existing Below reachability graph to include only containment arcs whose member can reach the container again. Containment outside a cycle contributes no traversal root and leaves existing routing unchanged. This removes the second ranking pass and its helper. All 18 immediate rank, route, and label cases pass in 1.40 seconds. The entire renderer package is now under validation before another full gate.

The remaining label failure came from port settlement resizing a packed child about its center while its inline parent retained the original Graphviz sides. The workhorse group grew from 3514.5 to 3611 points and crossed the cached parent boundary. holdResizedChildren now grows inline frame sides and their title rows around updated children before rerouting. The original full Agent workbench probe now reports no card, detached-label, wall, or label-across-wall failures. The existing wide-board owner is the regression owner. All 18 immediate rank, route, and label tests and targeted lint pass. Temporary instrumentation is removed.

Final acceptance on source commit 0e53dbb2b: bun run check passed with exit 0 in 586.74 seconds. Modules: 4,869 passed, 1 skipped, 0 failed. System: 257 passed. Repository: 135 passed. All 19 serial browser owners completed with 27 passed tests. Log: /tmp/archboard-final-check-4.log. Timing: /tmp/archboard-final-validation-timing-4.json. The separate renderer run passed 709 tests, skipped 1, and failed none in 139.29 seconds. No assertions, normal owners, lint rules, or timeout contracts were weakened.

The final worktree restart and both overview rasterizations passed. The Browser application and Semantic renderer PNGs were inspected and remain readable. The refreshed code pass reports zero structural diagnostics and zero ANCHOR_MISMATCH, down from 82 at baseline. It still exits 1 for five baseline ANCHOR_SYMBOL_MISSING warnings and fourteen scope-explained RELATIONSHIP_UNDRAWN warnings. Twenty-one EXPOSED_UNUSED information findings remain. No findings are suppressed. Evidence: /tmp/archboard-closing-code-check.json, /tmp/archboard-closing-browser.png, /tmp/archboard-closing-renderer.png, and /tmp/archboard-closing-timings.json.

Final simplification retains one cycle walk and reuses Below reachability to include only containment arcs that close a cycle. Only packed side ports reserve the extra turning clearance. Scene walls match the drawn lone frame. Inline frames contain children after port settlement changes their widths. The existing wide-board tests cover the original publication-label, card-clearance, and final frame-containment failures. The two small regression fixtures cover the minimized original causes. Temporary probes and instrumentation are absent from product source.

The final behind audit reads the renderer changes from fe3510df3 through 0e53dbb2b. Archboard parts Workspace packages and renderer keep their package responsibilities. Renderer layout parts Card blocks, Block packing, and Block layout keep their existing interfaces and ownership. These commits repair internal ordering, spacing, and containment, so those boards remain true without a proposal. Compound graph is behind only because dffd62d00 corrected a source comment. Voice coordinator Approvals is behind because TASK-500 commit 4f1acfae4 removed internal re-exports and import cycles. Its approval responsibility remains unchanged, and none of the closing tasks modifies it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Repaired nested-container cycle ordering, side-entry clearance, drawn frame walls, and child containment after port settlement. All 709 runnable renderer tests pass, with one skipped. The complete normal gate passes in 586.74 seconds, including all 19 browser owners. Existing geometry assertions, time limits, and coverage remain intact. The final implementation reuses existing graph logic and keeps public renderer contracts unchanged.
<!-- SECTION:FINAL_SUMMARY:END -->

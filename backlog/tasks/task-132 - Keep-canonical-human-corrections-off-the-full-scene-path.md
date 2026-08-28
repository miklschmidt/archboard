---
id: TASK-132
title: Isolate one empty human acknowledgement in the performance gate
status: Done
assignee:
  - '@codex'
created_date: '2026-08-28 02:52'
updated_date: '2026-08-28 04:18'
labels: []
dependencies: []
references:
  - scripts/check-human-edit-performance.mjs
  - src/ui/canvas/useCanvasSession.ts
  - src/ui/canvas/change-reporting.ts
priority: high
type: bug
ordinal: 148000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The retained 10,000-element human-performance browser check intermittently reported [0,0,2] for an empty compact acknowledgement. Tagged tracing proved that pair was a test-attribution error: trusted Excalidraw text-editor startup landed two replaceAllElements calls inside the global 120 ms response sample after the empty response had returned. The acknowledgement reducer caused neither call. The real correction still used the single whole-scene seam allowed by TASK-118.

Two runtime-correlation replacements were measured and rejected. A response promise token crossed browser task sources. Counting element-bearing updateScene calls classified as captureUpdate NEVER also failed because pre-report text-ID normalization and canonical correction application share that contract. Late quiet-fixture variants were also rejected because activeTool selection and editingTextElement are independent after text editing starts.

Use one controlled quiet scenario at the clean initial probe boundary. After probe installation, its existing 300 ms settle, and the fsync baseline, but before delayed drag, resize, or text work, frame the ordinary drag rectangle and compute its point. Require the active tool is selection, editing is null, reports and responses are both zero, inflight is zero, and drag x exists. Snapshot the count boundary and x, then use the scenario's proven dragFrom(point, 20, 0) as the sole quiet edit. Issue no browser command through the unchanged REPORT_IDLE_SETTLE_MS plus two RESPONSE_DELAY_MS interval. The sole final page-state read must prove x increased by more than 10 and exactly one response after the boundary is full:false, document-free, correction-free, compact, and has replacementsAfter zero. Then run the original delayed drag, resize, typing, Escape, and post-Escape settle/read workflow unchanged from its new one-report baseline. Earlier overlapping replacement samples and the global replacement count remain diagnostics only.

Reducer coverage separately proves an empty acknowledgement adds zero scene updates and an applicable correction adds exactly one while newer local edits converge. Do not add production hooks, extra fiber discovery, async ownership tokens, captureUpdate classification, partial Excalidraw mutation, new timing constants, widened timings, or weaker performance budgets.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A repeatable focused 10,000-element loop identifies the exact empty response and trusted editor callers behind the intermittent [0,0,2] observation.
- [x] #2 At the clean initial probe boundary, selection tool, editing null, zero reports/responses, and inflight zero are proven before one trusted 20 px drag yields more than 10 px local movement plus exactly one compact full:false document-free correction-free response with replacementsAfter zero and no browser command during the final 2,200 ms interval.
- [x] #3 Focused reducer coverage proves empty acknowledgement plus zero scene updates and applicable correction plus exactly one while the existing newer-edit convergence cases remain intact.
- [x] #4 The retained workload remains stable across five serialized human-performance runs and bun run check without relaxing the 10,000-element, delay, frame, request, fsync, size, full:false, or no-agent-write gates.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep the existing APP and replaceAllElements diagnostics. Expose activeTool.type alongside editing state in the existing pageState read. Add no runtime correlation, new imperative API discovery, stack matching, or production instrumentation.

2. Immediately after probe installation, the existing 300 ms settle, and fsync baseline, frame drag and compute its point. Read page state once and fail closed unless tool is selection, editing is null, reports and responses are zero, inflight is zero, and drag x is finite. Snapshot the count boundary and x.

3. Use the proven dragFrom(point, 20, 0) as the sole quiet edit. Issue no browser command for REPORT_IDLE_SETTLE_MS plus two RESPONSE_DELAY_MS intervals. Read page state once after that unchanged 2,200 ms interval. Require x increased by more than 10, exactly one report and response crossed the saved boundary, requestFullReport false, no document, zero correction upserts/deletes, compact bytes, and replacementsAfter zero.

4. Run the original delayed drag, ArrowRight, resize, text, Escape, and post-Escape settle/read workflow unchanged from the new one-report baseline. Remove every late quiet-fixture interaction and restore the original REPORT_IDLE_SETTLE_MS plus two RESPONSE_DELAY_MS plus 700 ms settle, pageState read, 180 ms wait, and final pageState read.

5. Keep all count and budget assertions unchanged. Static accounting expects 6 reports, 9 holds, 3 releases, and 12 fsyncs: within reports <= 8, holds <= reports + 3, releases <= holds, and the existing proportional fsync range. Keep global compact/full:false, no-agent-write, frame, request, fsync, and size checks plus replacement diagnostics.

6. Retain the exact sceneUpdates plus-one assertion in the existing applicable canonical-correction reducer case and all existing newer-edit convergence tests. Run focused gates, obtain the serialized browser lane, require five consecutive human-performance passes, then bun run check sequentially. Commit the two scripts separately from the TASK-132 Backlog record and request independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Confirmed cause on base f4a74e7: the failing empty response returned at 19,476.2 ms. Trusted Excalidraw text-editor startup then called replaceAllElements at 19,554.6 ms through startTextEditing and insertElementAtIndex, and at 19,559.0 ms through startTextEditing and handleTextWysiwyg. The global 120 ms sample charged both to the acknowledgement.

The real correction was separate. One correction-bearing response produced one apply_server_update containing 10,001 current elements, one applySceneUpdate, and one server-update stamp cycle. There was no double application, queued-report re-entry, full:true request, agent write, or measured user-facing budget failure.

The promise-token attempt produced compact correction counts 0/0/0/1/0 but correlated element-bearing calls 0/0/1/1/0, so browser task ownership is not preserved by the response promise. The public-contract diagnostic then recorded two element-bearing NEVER calls of 10,001 elements each for one correction-bearing response and zero agent writes. Source maps them to pre-report text-ID normalization and the real correction. Both runtime-correlation schemes are rejected and removed from the plan.

The permanent check will isolate one ordinary final move after all trusted editor activity settles and index its sole response by response-count boundary. No browser command will run between final mouse-up and closure of that response sample. Earlier overlapping samples remain diagnostic only. Disposable promise and captureUpdate probes are removed; scripts/check-human-edit-performance.mjs is byte-identical to HEAD. The only tracked code diff is the reducer sceneUpdates plus-one assertion in scripts/check-change-reporting.mjs.

Approved implementation completed in the two owned scripts. The browser gate now indexes one final ordinary drag response after all earlier activity settles, runs no browser command for REPORT_IDLE_SETTLE_MS plus two RESPONSE_DELAY_MS intervals after mouse-up, and asserts the sole new response is full:false, document-free, correction-free, compact, and has replacementsAfter zero. Earlier replacement samples and the global replacement count remain diagnostics only. The canonical-correction reducer case retains the exact sceneUpdates plus-one assertion. Focused validation is green: test:reporting 116 checks, type-check, lint:code, focused oxfmt check, and git diff --check. Browser validation is pending an exclusive serialized lane grant.

The first quiet-scenario browser run failed closed with a settled 5/5 boundary but zero final move report and zero response. No post-failure edit was made until parent direction. The approved fixture-only amendment now reuses the proven resize-path canvas click after framing, snapshots the drag rectangle x at the settled boundary, and checks a greater-than-10 x increase from the sole final page-state read before the response assertion. Focused validation after the amendment is green: test:reporting 116 checks, type-check, lint:code, focused oxfmt, and git diff --check. Browser rerun is pending a new exclusive lane grant.

Static source inspection showed the missing causal boundary: Excalidraw ArrowRight moves elements from selectedElementIds, while the failed final path never observed or asserted selection after text editing. The generic canvas-root click plus pointer drag left x unchanged and produced no report. The approved one-file amendment now exact-clicks pointOf(drag), exposes selected ids through the existing pageState probe, requires editing null and selected exactly [drag] before the response boundary, and uses the earlier scenario proven ArrowRight nudge. No timing, production, reducer, workload, budget, or quiet-interval behavior changed. Focused validation is green: test:reporting 116 checks, type-check, lint:code, focused oxfmt, and git diff --check. Process audit is clean; browser validation awaits an exclusive lane.

The first exact-point selection run failed closed because the text tool remained active: selected [drag], editing Q-hKsOKqJBaDQc1XBsqMF, drag x 12.111111111111114 to 13.111111111111114, but zero final reports and responses. Pinned Excalidraw source maps key 1 to the selection tool. The approved fixture-only amendment now presses 1 before framing, records activeTool.type in pageState, and requires tool selection, editing null, selected [drag], plus the settled reporter conditions before taking the response boundary. Timing, workload, budgets, production code, and the command-free interval stay unchanged.

The selection-tool amendment also failed closed. Key 1 produced tool selection, but the exact-point click hit bound text and set editing NGkdBM5xitLDV9ZFTJIzf. ArrowRight moved drag x 12.111111111111114 to 13.111111111111114 but produced zero final reports and responses. The approved simplification removes the pre-boundary click, selected-id gate, and ArrowRight. It keeps key 1 and framing, checks selection tool plus editing null before the boundary, then reuses the scenario-proven 20 px drag as the sole quiet edit and requires more than 10 px movement.

Approved relocation implemented in scripts/check-human-edit-performance.mjs. The controlled acknowledgement now runs from the clean zero-count state immediately after probe settle and fsync baseline. The late press-1/editor cleanup fixture is removed, and the original post-Escape settle/read flow is restored. Static accounting expects the added report to take totals from 5/7/2/10 reports/holds/releases/fsyncs to 6/9/3/12, so no existing count or budget assertion changes. Focused validation and serialized browser proof remain pending.

Validation is green. Focused gates passed: test:reporting 116 checks, type-check, lint:code, focused oxfmt, and git diff --check. Five strictly serialized headless strace-backed test:human-performance runs passed consecutively. Every run proved clean selection/null-editing/zero-count startup, drag x 0 to 11.111111111111114, one 288-byte full:false document-free correction-free isolated response with replacementsAfter zero, 6 reports, 9 holds, 3 releases, 12 fsyncs, and zero agent writes. Worst report-correlated frame gaps were 50.1, 33.3, 66.7, 66.7, and 49.9 ms against each run's median-relative bound. A subsequent sequential bun run check passed the complete lint, format, type, unit, integration, and browser chain, including another green human-performance run with the same 6/9/3/12 accounting. Task remains In Progress and acceptance criteria remain unchecked for independent review.

Independent fixed-range review completed with zero Standards and zero Spec findings. The reviewed implementation changes only the two intended test scripts; no production or timing constants changed. The implementation was integrated on main as 4eeef0c.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the flaky global acknowledgement-attribution heuristic with one controlled empty acknowledgement at the clean initial 10,000-element probe boundary, and locked canonical corrections to exactly one reducer scene update. Five serialized browser runs and the complete bun run check passed without changing workload, timing, or performance budgets; independent review was clean.
<!-- SECTION:FINAL_SUMMARY:END -->

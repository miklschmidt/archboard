---
id: TASK-328.03
title: Refresh Semantic renderer and Renderer layout
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 09:24'
updated_date: '2026-09-24 09:32'
labels:
  - architecture
dependencies: []
parent_task_id: TASK-328
priority: medium
type: docs
ordinal: 566000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The renderer after ADR 0033 (Graphviz placement, libavoid routing, column folds). TASK-327 redrew Renderer layout's current variant; Semantic renderer still says reading choice, flank rules, scorecard and ELK in Compound layout's description, an edge label and a beat, and the ELK worker pool in a node description.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Each named board's current variant (or draft, for a board nobody has built) matches its source: every node's responsibility and binding, every relationship with a line of evidence, and every flow, view and walkthrough beat
- [x] #2 What the named boards' questions need from code added since 2026-09-17 is drawn
- [x] #3 Every change went through ./bin/dogfood under a claim; historical variants are untouched
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read ADR 0032/0033, src/transformers/semantic-renderer, text measurement and layout worker.
2. Claim Semantic renderer; list drift per node/edge/flow/view/beat with evidence; correct current variant in few writes.
3. Claim Renderer layout; re-read TASK-327's redraw against source; correct drift.
4. Rasterize every board and view into $CLAUDE_JOB_DIR/tmp/328-03, look at them, report renderer defects (incl. the Layout sequence self-step label overflow).
5. Release claims, ./bin/dogfood check clean for both boards, commit the two vault files and this task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Semantic renderer (v16->19): Compound layout, View dispatcher, Bun host, Browser application and Measured text descriptions rewritten against compound.ts (settleReading/chooseReading/betterReading, WRAP_MIN_FIT_GAIN), index.ts (layoutRemembered: 64 layouts keyed by content+edge standing, no lineage), runtime/semantic-renderer/lib/bun-host.ts + engine-pool.ts + layout-worker.ts (Bun Workers running Graphviz+libavoid, not ELK), ui/browser-renderer/index.ts. Measured text -> Renderer host edge removed: lib/host.ts carries no canvas; measurement goes through the global OffscreenCanvas (canvas-text.ts canvasWidth, Pretext). Added external Host canvas with edges from Measured text (canvasWidth), Bun host (installBunHost registers @napi-rs/canvas + GlobalFonts) and Browser application (loadDiagramFaces). Added Data-flow layout -> Measured text (step-rows.ts/sequence-card.ts measureNoteLines). fl3z5Duy render->call 'renderBoard' (semantic-board-routes.ts answerRender); qDiEFiIT render->data 'the painted body' (index.ts hands page.body to svgDocument). Render sequence flow: flow steps into lines self step (withStepLines), memo note on the measure step, compound self step rewritten. Views: Host canvas in Architecture drawing and Host seam; Data-flow drawing isolates the sequence grammar's edges and includes Measured text. Walkthrough: beats 1-2 rewritten, new beat on fresh top-to-bottom layout.
Renderer layout (v18->19): TASK-327 redraw checked against source and holds; Compound graph responsibility names comparison standing (compound-graph.ts archboard.relationship.standing); Sizing a card flow gains measureNaturalWidth and the whole-line canvas measurement (measurement.ts measureNode/exactWidth), width clamp step relabelled; Layout sequence flow draws each column-fold candidate as a solve on the Layout engine (betterReading -> settleReading -> host solve -> createLayoutEngine foldColumns) instead of a self step; memo note on the measure step.
Not fixable through the CLI: Semantic renderer's variant summary still says 'as implemented on 2026-09-13' (edit payload has no summary field). The shelved draft 'Readable layout' still carries the old ELK/flank/scorecard text; it is a frozen record and was left alone.
Renderer defect confirmed: Renderer layout @ Layout sequence, the self-step label 'Place with Graphviz, route around cards with libavoid' on the rightmost column (Layout engine) runs past the flow frame's right edge (frame ends ~x672, label ~x818; the page itself is wide enough). The self-step label width on the last participant column is not counted in the frame width. Label left as authored.
Checks: ./bin/dogfood check reports no diagnostics; every board and view rasterized and inspected.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Semantic renderer and Renderer layout now describe the renderer after ADR 0032/0033: fresh downward layout with a column fold kept only when it fits the pane better, Graphviz/libavoid in Bun and Web Worker pools, a layout memo keyed by content, and text measured by the drawing place's canvas (new Host canvas node). Flows, views and beats updated; every change through ./bin/dogfood under a claim, historical and shelved variants untouched. Verified by reading each bound file, rasterizing every board and view, and ./bin/dogfood check (no diagnostics). Open: stale variant summary (no CLI field) and the Layout sequence self-step label overflow renderer defect.
<!-- SECTION:FINAL_SUMMARY:END -->

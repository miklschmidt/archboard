---
id: TASK-245.02
title: >-
  Measure a drawing by how it fits the reader's pane, and make that the layout
  suite's number
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 02:36'
updated_date: '2026-09-16 02:50'
labels: []
dependencies: []
references:
  - src/runtime/semantic-renderer/tests/wide-boards.test.ts
  - docs/design/wide-board-layout-fixtures/measure.ts
  - src/ui/semantic-board-canvas/lib/camera.ts
  - src/ui/theme/app.css
parent_task_id: TASK-245
priority: high
type: enhancement
ordinal: 425000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
tests/wide-boards.test.ts bounds page megapixels per Flask fixture, and every layout task since TASK-226 reported megapixels, corridor share and bends. Area does not track what a reader gets: a 997x1468 column and a 3952x460 ribbon are the same area and fit the pane at 0.65 versus 0.32. The reference pane is the shell's board area at the desktop-only 1920 by 1080: 1920 minus the 320 navigator (--shell-navigator-width in src/ui/theme/app.css) and the 280 inspector (SemanticInspector.tsx), minus the 24 fit margin on each side (camera.ts FIT_MARGIN), about 1272 by 952; fit = min(1272/width, 952/height) capped at 1, the same arithmetic as fitCamera. Baseline fits measured 2026-09-16 on first renders: Agent workbench 0.62, Archboard 1.0, Board persistence 0.75, Board viewer 0.66, Browser application 0.73, Canvas server 0.75, Codex session 0.97, Command dispatch 0.88, Command interface 0.93, Renderer layout (Readable layout) 1.0, Semantic renderer 0.65, flask-map-1 0.49, flask-map-2 0.37, flask-map-3 0.48. The fixture measure script is docs/design/wide-board-layout-fixtures/measure.ts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One measurement owner reports a rendered diagram's fit in the reference pane, with the pane size defined once and derived from the shell widths it comes from, used by both the test and the measure script
- [x] #2 tests/wide-boards.test.ts holds the three fixtures and the vault's current boards to a fit no lower than the recorded baseline (with a small allowance) together with the existing reader invariants (no route through a card, no fan of skips down a flank, bounded bends, label on its own route), and no longer bounds megapixels
- [x] #3 The measure script prints fit for every fixture and vault board, and docs/design/layout-rules.md gains a dated section that defines the measure and records the baseline table
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/shared/shell-geometry/index.ts: the shell's fixed widths and heights, STAGE, REFERENCE_PANE derived from them, fitScale and fitIn (the camera's arithmetic).
2. camera.ts reads FIT_MARGIN and fitScale from it; the shell root sets --shell-navigator-width from NAVIGATOR_WIDTH (app.css no longer defines it); the inspector takes INSPECTOR_WIDTH; the shell-layout browser owner holds the mounted nav, header and stage to the module.
3. src/runtime/semantic-renderer/tests/drawn-ink.ts: one owner of fit, routes through cards (frames excluded), flank fan, corridor ink, bends and labels off runs, read by the test and the measure script.
4. Rewrite tests/wide-boards.test.ts: fit floors per fixture and per vault board (current variant, first render) less 0.02, with the reader invariants; no megapixel bound.
5. Rewrite measure.ts to print fit for every fixture and vault board (ALL=1 for every variant, PICTURES=1 for PNGs).
6. layout-rules.md section 13: define the measure, derive the pane, record the baseline table.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The pane derived from the shell is 1272 by 899, not 952: the pane bar is 36 and the collapsed dock bar 41 (40 plus its rule), on top of the 56 header. The shell-layout browser owner now asserts the mounted navigator (320), header (56) and stage (1600 by 947) against src/shared/shell-geometry and passes, so the derivation is held by the real shell. Baseline fits on this tree at that pane: flask-map-1 0.46, flask-map-2 0.35, flask-map-3 0.45, Agent workbench 0.59, Archboard 1.00, Board persistence 0.75, Board viewer 0.62, Browser application 0.69, Canvas server 0.71, Codex session 0.91, Command dispatch 0.88, Command interface 0.88, Renderer layout 1.00, Semantic renderer 0.61. Every board passes the reader invariants: no route through a card (frames excluded from the check, since a route inside a frame crosses it by design), flank fan at most 1, no label off its run. Bends per route by the suite's own count (bridges removed) are 0.2 to 2.7, far below the old 8 to 9.5 bounds, which had been set from measure.ts's bridge-inclusive count; the new bounds are 2.5/3.0/3.5 on the fixtures and 3.0 on vault boards. Validation: bun test src/runtime/semantic-renderer src/ui/semantic-board-canvas src/ui/shell (307 pass), type-check, lint:policy on the touched modules, lint:baseline, fmt:check, and the focused shell-layout browser owner (pass).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fit in the reference pane is now the layout suite's number. One shared module (src/shared/shell-geometry) defines the shell's widths and heights, derives the pane (1272 by 899) and owns the fit arithmetic the camera also uses; the shell root, the inspector and the camera read their numbers from it and the shell-layout browser owner holds the mounted shell to it. drawn-ink.ts is the one owner of the reader measurements for the wide-boards suite and the measure script; the suite holds the three fixtures and every vault board's current variant to its recorded fit less 0.02 plus the reader invariants, with no megapixel bound; measure.ts prints fit for every fixture and vault board; layout-rules.md section 13 records the measure and the baseline. Verified with the module suites, type-check, lint, fmt:check and the focused browser owner.
<!-- SECTION:FINAL_SUMMARY:END -->

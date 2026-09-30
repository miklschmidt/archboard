---
id: TASK-245.07
title: Release a label reservation the drawing does not use
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 18:18'
updated_date: '2026-09-16 18:37'
labels: []
dependencies: []
references:
  - src/runtime/semantic-renderer/lib/layout/compound.ts
  - src/runtime/semantic-renderer/lib/layout/label-runs.ts
parent_task_id: TASK-245
ordinal: 430000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A label with no clear run is reserved with the engine, which gives it a row of its own: its height plus one more gap between rows, 110 units for a one-line label (measured 2026-09-16 on two cards, gap 79 without and 189 with). After the next solve the label is placed on runs again, prefers a run nearest a route end, and usually moves off its reserved row, which then stays empty. Reservations are monotonic, so every later solve keeps paying for rows nobody uses. On the Canvas server board with returns on the left, owns listener and runs backend were reserved at y=231 and drawn at 120 and 148, leaving about 150 units of empty band above HTTP application; admits writes, render selected view and resolve node binding moved off their rows the same way. Adjacent to TASK-242, which owns the staircase a reserved label route takes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A label the settled drawing places off its reserved box is no longer reserved, when every label still finds a box without it
- [x] #2 No vault board or wide-board fixture gets a taller page from this, measured on the scorecard in docs/design/wide-board-layout-fixtures/measure.ts
- [x] #3 A renderer test owns the behaviour on a board whose reservation is abandoned
- [x] #4 The gap between two rows is a label height plus 16 units above and 16 below, and a label on a run keeps 16 units from a card, as the user specified on 2026-09-16
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move label settling out of compound.ts into label-reservations.ts, driven by a solve callback.
2. Each attempt reports reserved labels drawn off their engine box.
3. Once every label has a box, release unused reservations all together, then one at a time; keep a release only when the page is no taller, no larger, smaller in one, and no more crossed.
4. Set elk.spacing.labelNode to 16.
5. Measure every variant on the scorecard against the tree before; fix tests that pinned 24 or miscounted bridge seams.
6. Unit test the release rule with a fixed solve; record section 20 in layout-rules.md.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured every variant of every vault board and the three fixtures against the tree before (measure.ts, ALL=1): no page got taller; every board improved on fit or page area; the one measure that worsened is Semantic renderer bends per route 1.3 to 1.6. Release alone moved Agent workbench, Canvas server and Semantic renderer; the 16 clearance moved every board. Release conditions each earned by a measured counterexample (Command dispatch widened, flask-map-2 rerouted at equal size, same-destination nesting test crossed). Tests: label-reservations.test.ts owns the release rule with a fixed solve (fails with releasing off); label-runs.test.ts reads the clearance from the layout instead of pinning 24; the scorecard route reader drops bridge seams that a proposal test counted as turns. env -u FORCE_COLOR bun run check passed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reserved labels the settled drawing draws elsewhere are released when the page gets smaller at no crossing cost, and a label keeps 16 units from cards and run ends, so a row gap is label plus 32. Every board and fixture got smaller or fit better; layout-rules.md section 20 has the numbers. Verified with the scorecard run, the new unit tests and the full gate.
<!-- SECTION:FINAL_SUMMARY:END -->

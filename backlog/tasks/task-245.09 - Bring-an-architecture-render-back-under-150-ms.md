---
id: TASK-245.09
title: Bring an architecture render back under 150 ms
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 19:30'
updated_date: '2026-09-17 09:57'
labels:
  - renderer
  - performance
dependencies: []
references:
  - src/runtime/semantic-renderer/lib/layout/compound.ts
  - src/runtime/semantic-renderer/lib/layout/label-reservations.ts
  - docs/design/wide-board-layout-fixtures/measure.ts
parent_task_id: TASK-245
ordinal: 433000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rendering one variant went from about 100 ms to nearly a second on 2026-09-16 (warm engine, first render): Semantic renderer Current architecture 112 ms before TASK-245.07, 617 ms after it, 928 ms after TASK-245.08; Canvas server 93, 347, 748 ms. Releasing unused label reservations re-solves the board once per release attempt, and choosing a flank rule settles three more drawings. The server also lays out every predecessor of a proposal before the proposal itself. The canvas shows its loading skeleton on a first draw for that long, and the user asked for a performance loop back to sensible times, ideally under 150 ms, without giving back the layout gains those subtasks measured on the scorecard.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A render of the current variant of every vault board and of each wide-board fixture, engine warm, takes under 150 ms, measured by a repeatable timing script whose numbers are recorded in docs/design/layout-rules.md
- [ ] #2 No board or fixture is worse on the scorecard than on the tree before the optimization on more measures than it is better, or the trade is recorded with the user
- [ ] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. A timing script beside measure.ts: median of warm renders per board and fixture, with engine solves counted.
2. Profile where a render spends its time: solves per render, time per solve, time outside the engine.
3. Cut solves first (release attempts, flank rule settles, predecessor re-layout), then time per solve; after each step run the timing script and the scorecard against the tree before.
4. Record the numbers in layout-rules.md; bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Exact optimizations landed locally (scorecard unchanged on every vault variant and fixture): solves remembered per settle, release only on the kept branch, engine worker pool sized from host cores, bounded reading choice, flank rules settled ahead for the down reading, grown gap in parallel, layout remembered by lineage. Nine of fourteen boards under 150 ms first render; Canvas server ~340, Semantic renderer ~170, Board persistence ~120-280, fixtures 400-900 warm. Repeat renders ~1 ms. Remaining gap needs a choice with the user (fewer flank rules, lighter label settling, another placement). layout-rules.md section 22. bun run check passed.

2026-09-17: closed at the user's call that the current situation is very good and acceptable. Since the notes above, pictures are drawn in the browser (TASK-247) and the Bun renderer gained a shared compiled engine, parallel reservation releases and elk-rs 0.11.3: Bun timing sum 2569 -> 907 ms, browser first picture ~396 ms mean, kept pictures shown at once, pictures byte-identical across every vault variant and fixture. Criterion 1 (every board under 150 ms) is not met for the largest boards and fixtures; the user accepted that.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rendering was cut substantially (per-settle memoisation, kept-branch releases, host-sized engine pools, shared compiled engine, parallel releases, elk-rs 0.11.3, browser drawing with kept pictures) with the scorecard unchanged; most boards render under 150 ms and the rest were accepted by the user as they are.
<!-- SECTION:FINAL_SUMMARY:END -->

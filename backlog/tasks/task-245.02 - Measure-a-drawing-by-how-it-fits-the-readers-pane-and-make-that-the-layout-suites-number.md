---
id: TASK-245.02
title: >-
  Measure a drawing by how it fits the reader's pane, and make that the layout
  suite's number
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-16 02:36'
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
- [ ] #1 One measurement owner reports a rendered diagram's fit in the reference pane, with the pane size defined once and derived from the shell widths it comes from, used by both the test and the measure script
- [ ] #2 tests/wide-boards.test.ts holds the three fixtures and the vault's current boards to a fit no lower than the recorded baseline (with a small allowance) together with the existing reader invariants (no route through a card, no fan of skips down a flank, bounded bends, label on its own route), and no longer bounds megapixels
- [ ] #3 The measure script prints fit for every fixture and vault board, and docs/design/layout-rules.md gains a dated section that defines the measure and records the baseline table
<!-- AC:END -->

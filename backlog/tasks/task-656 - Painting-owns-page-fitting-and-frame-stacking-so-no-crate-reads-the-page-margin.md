---
id: TASK-656
title: >-
  Painting owns page fitting and frame stacking, so no crate reads the page
  margin
status: To Do
assignee: []
created_date: '2026-11-20T03:28:00Z'
updated_date: '2026-11-20T03:28:00Z'
labels: []
dependencies:
  - TASK-653
ordinal: 1137000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
archboard-painting exports `diagram_margin()`, a getter over a constant, and three page builders do math on it: the architecture page fits its drawing (crates/archboard-layout/src/architecture/page.rs:77-86), the flowchart stacks its frames (crates/archboard-flows/src/flowchart/frames.rs:73-104), and the sequence stacks its frames (crates/archboard-flows/src/sequence/layout.rs:455-477). Each repeats the same "start at the margin, add the gap, pad both sides" logic, so a change to how pages are padded touches three crates. The code check misses it: flowchart wraps the math in `.max(...)`, and the Rust rule stops at the local `DIAGRAM_MARGIN` const in the sequence module.

The archboard-deepen run (TASK-653) kept the getter because the design below adds a callback interface only to remove one value; the owner wants it anyway. The design Astra gave in that run: `fit_architecture_page(drawing) -> drawing` moves the architecture fitting into Painting (an empty drawing returns as is; translate by margin - min; extent span + 2 * margin). `stack_flow_page<T>(kind: FlowPageKind, gap, frames: impl IntoIterator<Item = (T, f64)>, place: impl FnMut(T, FrameSite) -> Rect) -> Size` owns the cursor and page size: flowchart starts at the margin, top += height + gap, width is the max of width + 2 * margin from zero, height ends at (top - gap) + margin; sequence keeps (frame.y + height) + gap and its max over right edges, both ceiled. Keep the float order exactly: folding from the margin and from zero differ (84.2 + 70.1 gives 226.29999999999998 one way and 226.3 the other). Full answers: artifacts/archboard-deepen/20261119T144122Z/painting-values-astra.md and painting-values-brief.md (ignored, may be gone). The sequence also reads the margin outside stacking (layout.rs:356 content left, layout.rs:417 column placement); the design must cover those too.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard-painting exports no page-margin value or getter, and no other crate reads the margin
- [ ] #2 The architecture page, the flowchart and the sequence get their page size from one Painting operation each, and none repeats margin or gap math
- [ ] #3 Every drawing in the render corpus is byte-identical before and after (bun scripts/render-corpus.ts render and compare)
- [ ] #4 archboard-painting interface width does not rise, and archboard check code reports no new finding
- [ ] #5 Tests for the stacking cover an empty page, one frame and several frames at the Painting seam
<!-- AC:END -->

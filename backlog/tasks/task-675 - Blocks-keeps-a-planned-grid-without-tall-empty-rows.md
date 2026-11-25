---
id: TASK-675
title: Blocks keeps a planned grid without tall empty rows
status: To Do
assignee: []
created_date: '2026-11-24T03:54:00Z'
labels:
  - renderer
  - layout
dependencies: []
ordinal: 1165000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On the model of feat/kinds-effects-lenses (#154), this repository's root reading keeps Blocks' planned grid but draws 3472x2846 with tall empty rows. The same reading on refactor/deepen-shallow-modules (#156), with that layer's model, draws 2724x1810. The review of #154 declined stricter guards (sol-loop K1-S2, K3-S1, K3-S7) because each made Blocks lose the README's planned grid (2617x1199 became a 1921x1963 fallback). The fix belongs in the planner: it makes room for the lines instead of growing whole rows.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The root reading of the feat/kinds-effects-lenses model keeps the planned grid with no row taller than its cards and the lines that pass it need
- [ ] #2 The README reading keeps its planned grid
- [ ] #3 The render corpus shows which drawings change, and none fails
<!-- AC:END -->

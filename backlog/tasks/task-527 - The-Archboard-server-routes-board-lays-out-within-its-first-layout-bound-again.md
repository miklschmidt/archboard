---
id: TASK-527
title: The Archboard server routes board lays out within its first-layout bound again
status: To Do
assignee: []
created_date: '2026-10-24T19:57:00Z'
labels:
  - renderer
dependencies: []
references:
  - packages/renderer/tests/runtime/operations/blocks/wide-boards.test.ts
priority: high
type: bug
ordinal: 928000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After TASK-526.04 was adopted on 2026-10-24, the current variant of the dogfood board Archboard server routes gained the Track embed route part, a reworded Board writes part and five relationships. Its first track layout in packages/renderer/tests/runtime/operations/blocks/wide-boards.test.ts now takes about 3970 to 4040 ms against the 3000 ms LOADED_LAYOUT_BOUND_MS, reproducibly and alone (load 1.9). With the board as it was before that adoption (commit 83c9a7490^), the same case passes. The bound stands for what a pane waits for a first layout, and TASK-512 already kept this board within the render budgets once. The gate (bun run check) fails until this is repaired.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The Archboard server routes (track) case of wide-boards.test.ts passes its first-layout bound alone and inside bun run check
- [ ] #2 The bound itself and every other assertion of the test are unchanged
- [ ] #3 The board still draws what the code does: archboard check code reports no new finding on it
<!-- AC:END -->

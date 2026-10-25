---
id: TASK-536
title: Blocks keeps the label of every Codex workhorse relationship on its own route
status: In Progress
assignee: []
created_date: '2026-10-25T14:14:00Z'
updated_date: '2026-10-25T14:32:00Z'
labels: []
dependencies: []
ordinal: 958000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CI fails on feat/reusable-codex-workbench (PR #2): packages/renderer/tests/runtime/operations/blocks/wide-boards.test.ts draws every vault board, and "Codex workhorse (blocks)" fails "labels off their own route" for relationship XkZUEZcj (Workhorse queue → Shared instruction policy, "a queued message as the authored user input"). It fails every run, and shorter wordings of the label fail the same way, so the cause is in the Blocks layout, not the board. The board changed on this branch when it named the new package paths. The user chose a renderer fix over leaving CI red, although the renderer is being rewritten: keep the fix small.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 wide-boards.test.ts passes for Codex workhorse on both layouts, and every other case keeps passing on the hosted bounds (CI=true)
- [ ] #2 The fix names the cause in the Blocks label placement, and no check, bound or assertion of the renderer tests is weakened
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause and fix (d8fbfb7cd): the Blocks step pass (packages/renderer/src/shared/rules/blocks/lines/steps.ts) refused a slide only when it ran through the line's own label box, so a slide could put a turn within BEND_RADIUS (8 units) of the label, which then sat on the rounded bend (docs/design/layout-rules.md section 32). The pass now grows the line's own label box by BEND_RADIUS. Regression owner: joined-steps.test.ts, red before and green after. CI run 40201286232 also timed out 'Codex realtime voice (blocks)' at 60 s, before this fix and unrelated to it: its Blocks layout took 75.7 s locally at load 8 (49 nodes, 89 edges, 10 containers, the class of Browser application with 55 and 68, and Board viewer with 59 and 128). It gets the heavy Blocks budget with its own evidence after TASK-530.05 reshapes that board, with docs/agents/test-suite.md updated.
<!-- SECTION:NOTES:END -->

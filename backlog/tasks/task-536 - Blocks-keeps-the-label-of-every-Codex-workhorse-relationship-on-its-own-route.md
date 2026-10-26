---
id: TASK-536
title: Blocks keeps the label of every Codex workhorse relationship on its own route
status: In Progress
assignee: []
created_date: '2026-10-25T14:14:00Z'
updated_date: '2026-10-25T19:31:00Z'
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
- [x] #1 wide-boards.test.ts passes for Codex workhorse on both layouts, and every other case keeps passing on the hosted bounds (CI=true)
- [ ] #2 The fix names the cause in the Blocks label placement, and no check, bound or assertion of the renderer tests is weakened
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause and fix (d8fbfb7cd): the Blocks step pass (packages/renderer/src/shared/rules/blocks/lines/steps.ts) refused a slide only when it ran through the line's own label box, so a slide could put a turn within BEND_RADIUS (8 units) of the label, which then sat on the rounded bend (docs/design/layout-rules.md section 32). The pass now grows the line's own label box by BEND_RADIUS. Regression owner: joined-steps.test.ts, red before and green after. CI run 40201286232 also timed out 'Codex realtime voice (blocks)' at 60 s, before this fix and unrelated to it: its Blocks layout took 75.7 s locally at load 8 (49 nodes, 89 edges, 10 containers, the class of Browser application with 55 and 68, and Board viewer with 59 and 128). It gets the heavy Blocks budget with its own evidence after TASK-530.05 reshapes that board, with docs/agents/test-suite.md updated.

With the budget (commit above), the Codex realtime voice (blocks) case runs to its end locally in 34.7 s under CI=true and fails 'routes through cards': relationships 2ed6AqSF, mxl6bmYW, zEsrkAfC, mAyzTmDD and o63C7KPd route through the card ME7EbWl8 (Workhorse list). The timeout had hidden it before.

CI evidence: GitHub Actions run 40224624571 (commit 5a47f709a), Complete validation gate passes. Codex workhorse (track) 1.4 s and (blocks) 2.6 s pass; Codex realtime voice (track) 10.0 s and (blocks) 104.8 s pass, the second under its declared 240 s budget; no case fails. b74c0f6ab (side-wall ports a lane apart) cleared the routes through card ME7EbWl8. AC #2 stays open: both fixes name their cause and no assertion was weakened, but f1cb2c0d7 raised the time bound of Codex realtime voice (blocks) from 60 s to 240 s. The user waived renderer performance gates because the renderer is being rewritten; whether that closes AC #2 is the user's call.
<!-- SECTION:NOTES:END -->

---
id: TASK-049
title: No eval covers putting two boards side by side
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 04:10'
updated_date: '2026-08-20 04:23'
labels: []
dependencies: []
references:
  - skills/excalidraw-skill/evals/evals.json
  - scripts/check-branch-compare.mjs
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Flagged by the TASK-045 agent after documenting the pane commands.

skills/excalidraw-skill/evals/evals.json has no eval that exercises panes. Eval 5, the headline path added by TASK-041, branches a board and compares it, all on one pane. So the sequence that failed in real use is only half covered.

The reported failure had two halves. The model redrew a variant instead of branching it, which eval 5 and scripts/check-branch-compare.mjs now cover. It also kept re-targeting the first pane and overwriting the board the human was reading, and nothing tests that at all.

That half is now testable, because TASK-033 made pane layout a command. The cold-read trace the TASK-045 agent produced is the eval: board new, library list, add, promote, save, save --variant, `pane open --board <branch>`, add, promote, save, `screenshot --pane right`, compare. What it should assert is that the source board is still on screen at the end, in the pane it started in, which is exactly what the old behaviour destroyed.

Note the split TASK-043 established: a check asserts what has an objective answer, an eval grades the choice. Whether an agent reaches for `pane open` rather than reusing the pane it has is a choice, so this is an eval. Whether the source board survived is objective and could be a check.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An eval covers putting a proposal beside its source with pane open
- [x] #2 The eval asserts the source board is still on screen in its original pane at the end
- [x] #3 The eval declares graded_by, which bun run test already asserts for every entry
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add scripts/check-side-by-side.mjs: the cold-read trace end to end, driven through the CLI (dist/bin.js) against a throwaway canvas on a random port, with WebSocket sockets standing in for panes the way check-boards.mjs does. It asserts the objective half: `board save --variant` moves nothing, `pane open --board <branch>` makes a NEW pane rather than re-pointing the one in use, `screenshot --pane right` photographs the branch, and at the end the source board is still on screen in the pane it started in, having received no board_switched across the whole run.
2. Add eval 7 to skills/excalidraw-skill/evals/evals.json, graded_by scripts/check-side-by-side.mjs, matching eval 5's shape: prompt asks for the proposal beside the current architecture, expected_output names the choice being graded (reach for `pane open`, not `board open` into the pane the human is reading) and says the numbers are asserted by the script.
3. Have the new script assert the eval file names it, mirroring check-branch-compare.mjs's last section.
4. Wire test:side-by-side into package.json's test chain.
5. Prove it fails on the old behaviour by patching dist so `save --variant` drags the source pane, then rebuild.
6. node scripts/sync-skills.mjs, bun run test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added eval 7 to skills/excalidraw-skill/evals/evals.json and scripts/check-side-by-side.mjs, wired as test:side-by-side in the bun run test chain.

What is an eval and what is a check. The choice is the eval: with one pane on screen, both `pane open --board <branch>` and `board open <branch>` put the proposal up, both succeed, and only one of them leaves the source where the human was reading it. Nothing in the output distinguishes them, so only a transcript can say which the agent reached for. The consequence is objective and is the check: after the whole trace, the source board is still registered in pane p-source at place 'left', and that pane received no board_switched after the one that put its board there.

The check runs the TASK-045 cold-read trace through dist/bin.js, not through the routes underneath it, because `pane open --board <key>` is two server calls stitched together in canvas-client.openPane and stitching them the other way round is the bug. Panes are WebSockets standing in for tabs, the same simulation check-boards.mjs uses.

check-boards.mjs already proves the pieces (a branch moves no pane, /api/panes/open makes one, a switch reaches one socket). What was untested was the composite command and the sequence as a whole. The last section of the new check also runs the wrong path, `board open <branch>` into the only pane, and asserts the source goes off screen, so the check says what the mistake costs rather than only that the right path works.

Proven by regression, twice, against a patched dist and then rebuilt:
- panesFollowSave() forced to true (pre-ADR-0012): 10 checks fail, including 'THE SOURCE BOARD IS STILL ON SCREEN'.
- openPane() made to open the board into the existing pane (the pre-TASK-033 workaround): 11 checks fail, including the same one.
Clean tree: side-by-side all checks passed, bun run test exits 0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Eval 7 covers putting a proposal beside its source, and scripts/check-side-by-side.mjs is its objective half. The eval grades the choice between `pane open --board <branch>`, which makes a pane, and `board open <branch>`, which re-points the one the human is reading; both succeed with one pane on screen, so only a transcript separates them. The check runs the whole cold-read trace through the CLI against a throwaway canvas with WebSocket panes, and asserts that at the end the source board is still on screen in the pane it started in, then runs the wrong path and asserts it is not. Verified by regressing dist twice, panesFollowSave forced true and openPane made to reuse the pane, and watching the headline assertion fail both times; clean, the check passes and bun run test exits 0.
<!-- SECTION:FINAL_SUMMARY:END -->

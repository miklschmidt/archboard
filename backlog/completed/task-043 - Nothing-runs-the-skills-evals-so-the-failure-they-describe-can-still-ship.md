---
id: TASK-043
title: 'Nothing runs the skill''s evals, so the failure they describe can still ship'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 03:42'
updated_date: '2026-08-20 03:52'
labels: []
dependencies: []
references:
  - skills/excalidraw-skill/evals/evals.json
  - scripts/check-boards.mjs
  - src/core/compare.ts
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while adding TASK-041's evals. skills/excalidraw-skill/evals/evals.json is not in bun run test and no script in the repo reads it. Every eval in it is graded by a human reading a transcript, if anyone reads one at all.

That is tolerable for evals about drawing quality, which need judgement. It is not tolerable for the one TASK-041 just added, because that one has an objective answer and it guards a failure that already happened in real use: asked for a variant, the model drew a completely different diagram, and compare degenerated to everything-removed-everything-added.

The numbers are measured and stable. One source board, one change:

  branched                   redrawn from scratch
  sharedNodes     3          sharedNodes     1
  nodesAdded      1          nodesAdded      3
  nodesRemoved    0          nodesRemoved    2
  edgesUnchanged  2          edgesUnchanged  0

The redraw's removals come purely from wording two labels differently. A fully independent redraw is worse: comparable false, sharedNodes 0.

The TASK-041 agent had to encode the fail condition as prose inside expected_output because the format has nowhere else to put it. Its own conclusion: if this gap should be enforced on every build, it belongs in a scripts/check-*.mjs, not in an eval.

That check does not need a model. It can drive the two element sets through the real save, branch and compare path and assert the numbers, which is what the agent already did by hand to demonstrate the failure. What it cannot cover is whether an agent reading the skill chooses to branch, and that part stays an eval.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A check script asserts the branch-versus-redraw compare numbers and runs in bun run test
- [x] #2 The check fails when the source and the variant share no node identity
- [x] #3 evals.json states which of its entries are covered by a check and which need a human reading a transcript
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add scripts/check-branch-compare.mjs. It spawns its own server on a random high port with a temp vault (the shape check-boards.mjs uses), builds the payments board through the real HTTP element path plus the real planPromotion planner, branches it with save --as --variant option-a, adds the cache node and its one edge, saves, and compares.
2. Assert the branched numbers: comparable true, sharedNodes 3, nodesAdded 1 naming orders-cache, nodesRemoved 0, edgesAdded 1, edgesRemoved 0, edgesUnchanged 2, nodesChanged 0, and no stale-variant warning.
3. Express the pass condition as one named predicate and run it against a redraw as well: a board drawn from scratch with two labels worded differently gives sharedNodes 1, nodesAdded 3, nodesRemoved 2, edgesUnchanged 0, and a fully independent redraw gives comparable false and sharedNodes 0. The predicate must report violations on both.
4. Read skills/excalidraw-skill/evals/evals.json from the same check: every eval declares how it is graded, and a graded_by naming a script names a file that exists.
5. Wire test:branch into the package.json test chain and into CLAUDE.md's test line, one line each.
6. Mark the split in evals.json itself: eval 5 covered by the check, the rest graded by a human reading a transcript.
7. Demonstrate acceptance criterion 2 by running a scratch copy of the script that feeds the independent redraw into the branch assertions and showing it exit 1.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added scripts/check-branch-compare.mjs, wired as test:branch in the bun run test chain.

The check spawns its own canvas server on a random high port with a throwaway vault, then drives the real path: POST /api/elements for the boxes and arrows, planPromotion plus PUT /api/elements/:id for the promotions (so node ids are derived from labels the way promote derives them), POST /api/boards/save with a name and variant for the branch, and GET /api/boards/compare for the diff. No browser and no model.

One predicate, notABranch(diff), holds the pass condition, and it is run against three variants of the same source board: the branch, a redraw that words two labels differently, and a redraw that renames everything. It returns the reasons a diff is not a branch, so a failure names the number that moved.

Measured numbers reproduced exactly as the task recorded them. Branched: comparable true, sharedNodes 3, nodesAdded 1 (orders-cache), nodesRemoved 0, edgesAdded 1, edgesUnchanged 2, nodesChanged 0. Reworded redraw: sharedNodes 1, nodesAdded 3, nodesRemoved 2, edgesUnchanged 0. Independent redraw: comparable false, sharedNodes 0.

Two deliberate choices about variant stamping. The check passes --variant explicitly when promoting on the branch, so it does not depend on what promote defaults to on a variant board, which TASK-040 is changing. And the nodesChanged 0 assertion carries a comment saying it is zero because the branch restamps copied nodes with the variant they were saved as (TASK-035), so the next person to move that number knows what they broke.

The check also reads evals.json and asserts every eval declares graded_by, that one of them names this script, and that any other script named exists. That is the first time anything in bun run test reads the eval file at all.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
scripts/check-branch-compare.mjs now asserts the branch-versus-redraw compare numbers on every build, and evals.json says which of its entries a script grades and which a human does.

The check drives one source board through the real HTTP element, promotion, save-as and compare path against a server it spawns itself, and compares three variants of it: branched, redrawn with two labels worded differently, and redrawn with everything renamed. Verified by running it (25 checks pass, numbers identical to the ones the task recorded) and by bun run test end to end. Acceptance criterion 2 was demonstrated by running a copy of the check in which the proposal is drawn from scratch instead of branched: 6 checks FAIL and the script exits 1, naming comparable false, sharedNodes 0, nodesRemoved 3 and edgesUnchanged 0.

Whether an agent reading the skill chooses to branch stays eval 5, because no script can test a choice. The eval now carries graded_by pointing at this check and a sentence saying the numbers are asserted elsewhere, so the transcript is only asked about the choice.
<!-- SECTION:FINAL_SUMMARY:END -->

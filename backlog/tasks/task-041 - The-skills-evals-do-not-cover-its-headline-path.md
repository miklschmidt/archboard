---
id: TASK-041
title: The skill's evals do not cover its headline path
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 03:30'
updated_date: '2026-08-20 03:40'
labels: []
dependencies: []
references:
  - skills/excalidraw-skill/evals/evals.json
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
skills/excalidraw-skill/evals/evals.json only exercises drawing. After TASK-037 the skill's main path is branch a variant from a source board and compare the two, and nothing tests that an agent following the skill actually does it.

This is the path that failed in real use: asked for a variant, the model drew a completely different diagram, and compare degenerated to everything-removed-everything-added. TASK-037 fixed the instructions. An eval is what stops it regressing the next time the skill is edited.

The TASK-037 agent measured both outcomes on an isolated server, so the numbers to assert against already exist: a branched variant with one real change gives sharedNodes 3 and nodesAdded 1, while the same architecture redrawn from scratch gives sharedNodes 1, added 2, removed 2. That gap is the eval.

Left out of TASK-037 deliberately, because its scope was SKILL.md and references/.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An eval covers branch a source board into a variant, change one thing, compare
- [x] #2 The eval fails when a variant is redrawn from scratch rather than branched
- [x] #3 An eval covers checking the library before drawing primitives
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read the TASK-037 skill rewrite and evals.json, and confirm the compare result field names in src/core/compare.ts.
2. Reproduce both outcomes on an isolated canvas server, random high port, its own temp vault: a branched variant with one added node, and the same architecture redrawn from scratch on a blank board. Record the real compare summary numbers for each.
3. Add eval 5 to skills/excalidraw-skill/evals/evals.json: draw a source board, branch it into a variant, add one node and one edge, compare. Its expected_output states the summary numbers a branch produces, so a redraw cannot pass.
4. Add eval 6: check the library before drawing primitives, and place a stencil by name.
5. Demonstrate acceptance criterion 2 by running the redraw path and showing its compare summary violates eval 5's expected_output.
6. bun run test, then commit only the files touched.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added eval 5 (branch a variant, change one thing, compare) and eval 6 (list the library before drawing primitives) to skills/excalidraw-skill/evals/evals.json, in the existing {id, prompt, expected_output, files} shape. No new eval format.

Both outcomes were reproduced on an isolated canvas server, random high port, its own temp vault, no browser. The branched path gives exactly the numbers TASK-037 measured: comparable true, sharedNodes 3, nodesAdded 1, nodesRemoved 0, edgesAdded 1, edgesRemoved 0, edgesUnchanged 2, nodes.added naming only 'Orders Cache'.

AC 2 was demonstrated, not asserted. The same source board was branched by one run and redrawn on a blank board by another, then both were graded against the seven numbers eval 5 states. Branched: 7 of 7 ok, EVAL 5 PASSES. Redrawn: sharedNodes 1, nodesAdded 3, nodesRemoved 2, edgesAdded 3, edgesRemoved 2, edgesUnchanged 0, so 6 of 7 fail and EVAL 5 FAILS, with nodes.removed naming 'API Gateway' and 'Orders Postgres' purely because the redraw worded those two labels differently. A fully independent redraw is worse still: comparable false, sharedNodes 0.

Eval 5 deliberately says nothing about summary.nodesChanged. On this build a branch leaves the copied nodes stamped variant current, so compare reports nodesChanged 3 with a variantAnomaly field on each. TASK-035 changes that number, and pinning it here would make the eval fail once TASK-035 lands. The expected_output instead says out loud that narrating variantAnomaly as an architectural difference is wrong, which holds either way.

Eval 6 facts were checked against the running server: library list --text reports 111 stencils from seven source libraries; 'CDN' and 'Message queue' are unique names and insert cleanly; 'Load balancer' and 'Users' are each used by two libraries, so an insert without --source is refused naming every candidate, and --source system-design succeeds; placed elements carry customData.library.

bun run test passes, exit 0, 111 ok lines.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
skills/excalidraw-skill/evals/evals.json now covers the skill's headline path. Eval 5 asks for a proposal without saying how to build one, and its expected_output pins the compare summary a branch produces: comparable true, sharedNodes 3, nodesAdded 1, nodesRemoved 0, edgesAdded 1, edgesRemoved 0, edgesUnchanged 2. Eval 6 covers listing the library before drawing primitives, including the ambiguous-name refusal that a real insert hits. Verified on an isolated canvas server by running both an agent that branches and an agent that redraws: the branch matches all seven numbers, the redraw misses six of them and comes back with 'API Gateway' and 'Orders Postgres' removed, so the eval fails exactly where it should. bun run test passes.
<!-- SECTION:FINAL_SUMMARY:END -->

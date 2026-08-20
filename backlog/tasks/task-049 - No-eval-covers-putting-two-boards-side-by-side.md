---
id: TASK-049
title: No eval covers putting two boards side by side
status: To Do
assignee: []
created_date: '2026-08-20 04:10'
updated_date: '2026-08-20 04:10'
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
- [ ] #1 An eval covers putting a proposal beside its source with pane open
- [ ] #2 The eval asserts the source board is still on screen in its original pane at the end
- [ ] #3 The eval declares graded_by, which bun run test already asserts for every entry
<!-- AC:END -->

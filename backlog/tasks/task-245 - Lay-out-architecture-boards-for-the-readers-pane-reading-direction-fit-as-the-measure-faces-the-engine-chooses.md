---
id: TASK-245
title: >-
  Lay out architecture boards for the reader's pane: reading direction, fit as
  the measure, faces the engine chooses
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 02:34'
updated_date: '2026-09-17 10:43'
labels: []
dependencies: []
references:
  - docs/design/layout-rules.md
  - docs/design/wide-board-layout.md
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - src/runtime/semantic-renderer/lib/layout/compound-graph.ts
  - src/runtime/semantic-renderer/tests/wide-boards.test.ts
  - src/ui/semantic-board-canvas/lib/camera.ts
priority: high
type: enhancement
ordinal: 423000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Boards come out tall and narrow. Six of the eleven current vault boards are chains (five to seven ranks, at most three cards per rank) and the shell pane is landscape (1920 minus the 320 navigator and the 280 inspector, about 1272 by 952 after the fit margin), so nine of fourteen drawings are height-limited. The architecture layout can only read down the page: elk.direction is DOWN in one line of compound-graph.ts, never discussed in any ADR or task, and every face rule (step SOUTH to NORTH, return EAST, bracket WEST) is a compass literal, so direction was never on the table. ELK's own default is left to right.

Since TASK-211 there were 27 renderer commits in two days, 14 fixes, and four reversal chains (post-compaction LEFT added and removed the next day; a nested-skip west flank added and dropped; skip faces pinned, then freed for hubs, then narrowed twice; label reservation tightened, then a grown row gap added, then made conditional). Each was triggered by one named board. Three causes: faces are guessed before layout from graph-shape predicates (docs/design/layout-rules.md section 1 says so; its recommendation 1 landed for hub skips on first renders only, and the predecessor path of 1,227 lines over compound-predecessor, compound-node-hints, compound-flanks and compound-label-space still guesses every face); the acceptance owner tests/wide-boards.test.ts pins page megapixels, and a 997x1468 column and a 3952x460 ribbon are the same area while fitting the pane at 0.65 versus 0.32; and the reading model is compass-bound (42 face literals in four layout files, 18 of 27 renderer test files assert rows or faces).

Measured 2026-09-16 on a scratch copy, fit = min(1272/width, 952/height), first renders:

| board | today (DOWN) | fit | naive RIGHT | fit | RIGHT wrapped to 1.32 | fit |
|---|---|---|---|---|---|---|
| Semantic renderer | 997x1468 | 0.65 | 3952x460 | 0.32 | 2134x1105 | 0.60 |
| Command interface | 683x1027 | 0.93 | 2890x276 | 0.44 | 1225x690 | 1.00 |
| Board viewer | 1376x1443 | 0.66 | 4324x512 | 0.29 | 2398x1154 | 0.53 |
| Command dispatch (a fan) | 1441x685 | 0.88 | 1616x564 | 0.79 | 1051x942 | 1.00 |
| flask-map-2 | 1815x2588 | 0.37 | 5983x851 | 0.21 | 4687x1798 | 0.20 |

A naive flip makes ribbons; wrapped left-to-right wins on pure chains and loses on dense boards; ELK wrapping throws on any board with a frame (TypeError: nodeOrder[l][0].layer). Leaving every non-containment face to the engine under DOWN grew pages and bends (Board viewer 1376x1443 to 1211x1871, Semantic renderer bends 1.3 to 1.9 per edge), so the step and return conventions earn their keep and the bracket, top-approach and flank-reseating rules are the guesses. Direction is only half the height: on the Semantic renderer board seven ranks of 90px cards occupy 630 of 1468px, the rest is per-edge tracks and reserved label rows between layers; TASK-239 and TASK-242 own that lever and should be re-measured with the fit metric once it exists.

ADR 0023 names PR Lens's layout as the presentation chosen for clarity and finish, but the 2026-09-13 compound layout replaced it with ELK plus renderer-owned face rules and the ADR was never amended; its clause that fitting one viewport is not a success criterion meant tall-narrow was never a failure by any recorded criterion; and the fork reads its no-hints line more strictly than the ADR's own list (coordinates, font sizes, colours, connector routes). TASK-189's user correction (forward skips left, returns right) became the fixed west-flank rule undone over four later commits: a reading convention encoded as a per-edge port constraint.

Subtasks, in order: record the decision (ADR), make fit in the pane the measure, choose the reading direction per view, stop guessing faces, then two measured experiments (model-order continuity for proposals, wrapping for flat chains). TASK-237 is adjacent to the faces subtask.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every current vault board and the three wide-board fixtures fit the reference pane at a scale no lower than the 2026-09-16 baseline recorded in the fit subtask, and the chain-shaped boards (Semantic renderer, Command interface, Board viewer, Codex session) read left to right
- [x] #2 docs/design/layout-rules.md has a dated section recording what landed and what was measured and rejected, and an accepted ADR records the decisions
- [x] #3 bun run check passes with the bracket, top-approach and flank-reseating rules deleted rather than disabled
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Subtasks landed 2026-09-16 on branch task-245-layout. Fits (reference pane 1272x899, first renders) before -> after: Command interface 0.88 -> 1.00 (folded down into two columns); all other vault boards and fixtures unchanged (flask-map-1 0.46, flask-map-2 0.35, flask-map-3 0.45, Agent workbench 0.59, Archboard 1.00, Board persistence 0.75, Board viewer 0.62, Browser application 0.69, Canvas server 0.71, Codex session 0.91, Command dispatch 0.88, Renderer layout 1.00, Semantic renderer 0.61). AC1 partly met: no fit below baseline, but only Command interface changed shape, and none of the four chain boards reads left to right: every rightward reading, plain or folded, measured worse (layout-rules.md sections 14 and 17). AC2 met: ADR 0028 and layout-rules.md sections 13 to 17. AC3 partly met: hasTopApproach and the flank reseating are deleted, but brackets.ts stays because removing it lost fit on four boards with no engine option recovering it (section 15). Left open for a decision: whether chain boards should still read left to right at a fit cost, and the between-layer room (TASK-239, TASK-242) as the next lever for Semantic renderer and Board viewer.

2026-09-17, closed at the user's decision with two criteria met as measured rather than as written. #1: no vault board or fixture fits below the 2026-09-16 baseline, and several rose since (flank rules, section 21: Semantic renderer 0.70 to 0.91, Canvas server 0.77 to 0.97, Board persistence 0.75 to 0.84, Agent workbench 0.65 to 0.75). The chain-shaped boards still read down: every left-to-right reading, plain or folded, fit worse (sections 14 and 17), and the direction machinery chooses by fit, so a chain would read left to right the day it fit better. #3: the top-approach and flank-reseating rules are deleted; brackets.ts stays because removing it lost fit on four boards with no engine option recovering it (section 15), and it is now the default of the four flank rules the scorecard chooses between. The between-layer room remains the next lever for Semantic renderer and Board viewer (TASK-239, TASK-242).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The renderer reads each view in a direction chosen by its fit in the reader's pane, and a flat chain folds toward the pane. Faces under a predecessor come from solves rather than guesses, unused label reservations are released, and a first render keeps the flank rule the scorecard prefers, all within the render-time budget. ADR 0028 records the decisions, and layout-rules.md sections 13 to 22 record what landed and what was measured and rejected. No board fits below the baseline. Two criteria landed as measured rather than as written: chain boards read down, because left to right fit worse on every one; and the bracket rule stays, because removing it cost fit. Verified by the wide-board scorecard suite, flank-rules.test.ts and the subtasks' owners.
<!-- SECTION:FINAL_SUMMARY:END -->

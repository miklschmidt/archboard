---
id: TASK-497
title: >-
  A render receipt names what the picture marks, and the key counts only what it
  draws
status: Done
assignee:
  - '@claude'
created_date: '2026-10-18 13:15'
updated_date: '2026-10-18 15:44'
labels:
  - renderer
  - cli
dependencies: []
priority: medium
type: bug
ordinal: 862000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An agent rendering a design view on the device trust stack saw "Changed 1" in the key and no changed mark in the picture, and could not tell what had changed. The render receipt reports only the board, variants, view, file and size, so the only way to learn what a picture marks is to read its pixels.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The render receipt lists the subjects that the picture marks as added, changed or removed, with the counts that the key shows
- [x] #2 Every count in the key matches a mark that the picture draws, or the cause of a difference is found and fixed
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
One change covers TASK-496 and TASK-497. The proposals are `Command interface@TASK-496` and `Semantic renderer@TASK-496`. Both tasks use the one proposal name. No other board is affected. The browser panel's count changes its behaviour, not its wiring. The rasterizer receipt gains fields, not parts.

The cause of "Changed 1" with no mark: I reproduced it on Docs-Architecture-Design, board Device Trust Control Plane, variant feat/device-trust-operations, view "Rotate the Service leaf". The key counts `markCounts(request.standing)`. That standing holds every subject of the view's scoped content. The scoped content of a sequence view keeps the edges between its participants. The sequence grammar never draws an edge. So two changed edges were counted, and the key said "Changed 3" while the picture marked one step. A flowchart draws no nodes and no edges. An architecture view on a board with edges draws no flows and no steps. The browser panel counts the same map.

The design reads the drawn set from the painted drawing. The atlas is the renderer's own record of where each subject landed. On all 46 views of that board, the atlas keys are the subject ids that the SVG draws. The painter decides what a grammar places: the sequence painter places only participants and steps, and the flowchart places only its steps and its frame. A pure function before layout must restate the rules of each grammar. So the listing draws each view. That took about 4 s cold for 46 views, and it fills the layout cache for the render that follows.

1. Renderer (TASK-497 AC2), test first. `framedForExport` reads from its atlas the subjects that the painted drawing placed. It returns them beside the page as `placed`, also for a legend drawn alone. The legend counts `markCounts(placedStanding(standing, placed))`. `RenderedDiagram` carries `placed`. `placedStanding` lives in `picture-key.ts` beside `markCounts`.
2. Board answer (`board.ts`). After the drawing, the answer keeps `changes.standing` to the placed subjects. The browser panel, the key and every receipt then read one standing. The reply gains `drawn`: the nodes, edges, flows and steps that the picture places, each by id and by the name a person reads. That name is a node's or flow's name, an edge's label or "From → To", and a step's words. `drawnSubjects` is a pure function in `src/shared/semantic-board/lib/drawing.ts`. Its schema is in `rendering.ts`. An empty answer has an empty standing.
3. Receipts (TASK-496 AC1 and AC2, TASK-497 AC1). The receipts of `semantic render --out` and of `semantic rasterize --out` and `--clipboard` gain `drawn` and `marks`. When the picture marks a comparison, each drawn subject has a `standing`. `marks` holds the key's counts of added, changed and removed. When the picture marks nothing, it is null. One CLI helper builds both fields.
4. Listing (TASK-496 AC3). A new read command, `semantic views <board>`, takes `--variant`, `--against`, `--no-comparison` and `--layout` (`src/cli/commands/semantic-views.ts`). It draws the overview, every authored view and Everything through the render route. For each, it lists the view, the counts of nodes, edges, flows and steps drawn, the marks, and the size. A view that draws nothing there has zero counts and no size. The `--against` and `--no-comparison` options reuse the option, the refusal and `resolvedAgainst` of render.
5. Skills (TASK-496 AC4). The archboard skill changes in `sequences-views-walkthroughs.md` and the render line of SKILL.md. The archboard-pr skill changes in `references/renders.md`, "Choose the view" and "Look at it". Both list the views with `semantic views`. They read `drawn` and `marks` of the receipt before they render, and they still look at the final PNG. The eval inputs get coverage.json rows for the receipt and the listing. Then run `bun run generate:skill-artifacts`.
6. Tests. A renderer module owner holds the key's counts to the drawn marks in all three grammars. It also holds the reply's standing and `drawn` to the placed subjects. A system owner holds the receipt fields and the listing, with an empty view, `--against` and `--no-comparison`.
7. Close as archboard-dev says. Run the code check for TASK-496 with the diff before and after. Read the footprint from the first `Refs: TASK-496` commit. Adopt both proposals. Run `archboard check`, read `behind`, and run `bun run check`.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation notes (TASK-496 and TASK-497 are one change; the proposals are `Command interface@TASK-496` and `Semantic renderer@TASK-496`).

Cause of the mismatch, reproduced: Device Trust Control Plane in Docs-Architecture-Design, variant feat/device-trust-operations, view "Rotate the Service leaf" (sequence). Its key said Changed 3 and the picture marked one step. The two other changed subjects were edges `knSBynlL` and `utGjI3nE` between the view's participants. The scoped content keeps them, and the sequence grammar draws no edge. `src/runtime/semantic-renderer/tests/drawn-marks.test.ts` failed on this before the fix: the key showed [1, 3] where the picture drew [1, 2].

Decision: the drawn set is read from the drawing's own atlas (`framedForExport` returns `placed`, `RenderedDiagram.placed`), not from a pure function before layout. On all 46 views of that board, the atlas keys equal the subject ids that the SVG draws. Each painter decides what it places, so a pure function would restate three grammars' rules. The listing therefore draws each view: 48 drawings took about 5 s cold through the CLI, and they fill the server's layout cache for the render that follows.

Decision: the render answer's `changes.standing` holds the subjects the picture placed, with or without its comparison. One rule serves the key, the browser panel and every receipt. Two owners asserted that a picture drawn without its comparison reports the comparison's standing (`comparison-display.test.ts`, `workflow.test.ts`). They now assert that both answers are read against the same variant and that each reports what it draws. Without the comparison, the panel hides its "nothing differs" line as it hides its rows. Without that change, a plain picture of a proposal that only removes parts would say that nothing differs.

Decision: the panel keeps its comparison control on every reading, the overview included. It said "Nothing differs." and dropped the control when the overview's counts were empty. The overview draws part of the variant (ADR 0052), and no reading draws every kind of subject, so empty counts cannot show that a variant is identical.

Code check, `archboard check --code` against `--variant TASK-496`: before 26 findings, after 25. The proposals add none and clear one: RELATIONSHIP_UNDRAWN Board answer → Picture key, which the proposal draws as "keep the standing to what the drawing placed".

Footprint against base c3c2add65, the commit before the first `Refs: TASK-496` code commit. Both proposals read against their parent, the current variant.
- Command interface: namedAndChanged is Render, Rasterize and Views. changedNotNamed: Command catalogue (`run.ts`, b73b2935d) gains one table row for the new command, and the board already draws the catalogue reaching the Commands container that holds Views. Commands (directory) changed only through Views and the private helper `lib/drawn-receipt.ts`, which the board does not draw. namedNotChanged: Contract execution and Board client, both named only by the new relationships.
- Semantic renderer: namedAndChanged is View dispatcher, Bun host, Board answer, Export frame and Picture key. changedNotNamed: Flowchart (`flowchart.ts`, b73b2935d) passes the framed page's `placed` on, and its wiring did not change. Board viewer is skipped as a drill-down and has no proposal. `SemanticChanges.tsx` lies in its bound components directory, and the panel's behaviour changed, not its wiring.

Closing. Both proposals are adopted: Command interface at version 104 and Semantic renderer at version 74, each with the board's scope as its summary. `archboard check` reports no diagnostics.

`behind` after adoption: the commits of this task put four other boards behind. I read each part against the code.
- Board rasterizer, Receipt (`receipt.ts`): the receipt gains `drawn` and `marks`. Its responsibility, "What was drawn, at what scale, and from which SVG", is still true. The wiring is the same.
- Board viewer, Render stage states (components directory): `SemanticChanges` keeps its control on every reading. Its wiring is the same, and no part of the board states the old behaviour.
- Browser application, Application composition (`src/ui/application`): only the test fixtures changed.
- Skill evaluation, Evaluation inputs (`evals`): coverage.json gained two rows.
No finding of that run names code this task changed. The RELATIONSHIP_UNDRAWN on Board viewer (Picture cache to Fetch semantic reads) was there before.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The key of an exported picture, and the browser panel, counted every subject of a view's reading. A grammar draws only part of that reading. A sequence view keeps the relationships between its participants and draws none. A flowchart draws no parts and no relationships. An architecture view on a board with relationships draws no flows. On Device Trust Control Plane, view "Rotate the Service leaf", the key said Changed 3 while the picture marked one step. The other two were changed relationships that the sequence does not draw.

Now `framedForExport` reads from the painted drawing's atlas which subjects it placed, and the key counts the marks of those alone (`placedStanding` with `markCounts`). The render answer keeps `changes.standing` to the same subjects and names them in `drawn`. The receipts of `semantic render` and `semantic rasterize` list each drawn subject with its standing, and `marks` holds the counts that the key shows. The same view now reads Changed 1 in the key, the receipt and `semantic views`.

`src/runtime/semantic-renderer/tests/drawn-marks.test.ts` failed before the fix: the legend showed [1, 3] where the drawing drew [1, 2]. It now holds the key and the answer to the drawn marks in the sequence, flowchart and architecture grammars. The receipts are held by `tests/system/semantic-boards/view-listing.test.ts` and `rasterize.test.ts`. `bun run check` passed.
<!-- SECTION:FINAL_SUMMARY:END -->

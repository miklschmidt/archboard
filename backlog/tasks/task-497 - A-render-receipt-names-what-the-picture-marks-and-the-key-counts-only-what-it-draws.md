---
id: TASK-497
title: >-
  A render receipt names what the picture marks, and the key counts only what it
  draws
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-18 13:15'
updated_date: '2026-10-18 15:09'
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
- [ ] #1 The render receipt lists the subjects that the picture marks as added, changed or removed, with the counts that the key shows
- [ ] #2 Every count in the key matches a mark that the picture draws, or the cause of a difference is found and fixed
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

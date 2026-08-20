---
id: TASK-072
title: >-
  One converter: expand-elements becomes the only one, corrected to Excalidraw
  values
status: In Progress
assignee:
  - '@claude'
created_date: '2026-08-20 20:14'
updated_date: '2026-08-20 21:46'
labels: []
dependencies:
  - TASK-070
  - TASK-071
  - TASK-069
references:
  - src/core/expand-elements.ts
  - frontend/src/canvas/elements.ts
  - src/core/scene-io.ts
  - src/core/labels.ts
  - docs/design/server-is-the-truth.md
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
priority: high
type: enhancement
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 5 of docs/design/the-plan.md, and the centre of the whole change. From ADR 0015: "Conversion is where divergence comes from, so there is one of it, in one direction, at one boundary."

TODAY THERE ARE TWO CONVERTERS DOING ONE JOB.

  Ours          src/core/expand-elements.ts      called by src/core/scene-io.ts on the save path
  Excalidraw's  convertToExcalidrawElements      called by frontend/src/canvas/elements.ts:287 on every delivery

We already patch the second by hand. `frontend/src/canvas/elements.ts:213` exists to "restore startBinding/endBinding/boundElements after convertToExcalidrawElements strips them", and line 96 re-centres bound text the converter placed wrongly. So we run a conversion we do not control, correct it, and separately run a conversion of our own that nobody compares against the first.

They were compared. Given one board of nine agent-authored elements they produce documents differing on fourteen fields.

  Field                              Ours              Excalidraw's       Kind
  fontFamily on any text             1 (Virgil)        5 (Excalifont)     constant
  fontSize of a shape label          16                20                 constant
  fontSize of an arrow label         14                20                 constant
  strokeWidth of a bound text        1                 2                  constant
  textAlign of standalone text       center            left               constant
  verticalAlign of standalone text   middle            top                constant
  roundness on a rectangle           {type: 3}         null               constant
  strokeWidth on freedraw            2                 1                  constant
  strokeColor on freedraw            #1e1e1e           absent             constant
  elbowed on a line                  false             absent             constant
  lastCommittedPoint on freedraw     absent            null               constant
  arrow points                       [[0,0],[84,0]]    [[0.5,0],[83.5,0]] constant, half the stroke width
  text width                         estimated         measured           see TASK-070
  text height                        estimated         measured           see TASK-070

Twelve constants and two measured fields. That table is this task's specification.

WHAT TO BUILD. `src/core/expand-elements.ts` becomes the one converter, its twelve constants corrected against the table, imported directly by the frontend the way `src/core/labels` and `src/core/appearance` already are. The agent-friendly shape (`label`, `text`, `startElementId`, `endElementId`, tuple points) is accepted at the API boundary, converted once on write, and never seen again. Reads return native, because a conversion on read is a second converter.

`frontend/src/canvas/elements.ts` stops converting on read, and with it go the passes that exist only to correct a conversion that no longer happens: `restoreBindings`, `planLabelExpansion`, `adoptReusedLabelIds`, `dropSpentLabelSeeds`, `recenterBoundShapeTextElements`, `rescueStrayBoundTextElements`.

TEXT MEASUREMENT IS THE OPEN PART. TASK-070 decides it and this task cannot be finished without its answer. Do not start this until that spike has reported.

HOW IT IS PROVEN DONE. Not by "there is one converter", which a converter that is single and still wrong would satisfy. By the check from TASK-071: convert a board, render it in a real browser, and assert the browser reports nothing back. Flip that check from its recorded baseline to zero and wire it into `bun run test`.

EXPECT TO REWRITE CHECKS. `check-labels.mjs` has 128 checks and most of them are about machinery being deleted; its subject moves from "the seed and the text stay in step" to "there is one representation, and here is the proof". `check-obsidian-md.mjs` has 108. Rewriting them is part of this task, not a regression.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The agent-friendly shape is converted once, on write, at the API boundary, and reads return native elements with no conversion
- [ ] #2 convertToExcalidrawElements is gone from the delivery path, along with restoreBindings, planLabelExpansion, adoptReusedLabelIds, dropSpentLabelSeeds, recenterBoundShapeTextElements and rescueStrayBoundTextElements
- [ ] #3 Each of the twelve constants in the table matches Excalidraw, shown per field by a check
- [ ] #4 The TASK-071 browser check asserts zero changed elements and is part of bun run test
- [ ] #5 Text width and height follow whichever of TASK-070 three outcomes holds, and if it is the fallback, the limitation is written into ADR 0015 rather than left implicit
- [ ] #6 bun run test is green; check-labels and check-obsidian-md may be rewritten rather than preserved
<!-- AC:END -->

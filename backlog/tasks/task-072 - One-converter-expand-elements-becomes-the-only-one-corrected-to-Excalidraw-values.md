---
id: TASK-072
title: >-
  One converter: expand-elements becomes the only one, corrected to Excalidraw
  values
status: Done
assignee: []
created_date: '2026-08-20 20:14'
updated_date: '2026-08-21 12:40'
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
- [x] #1 The agent-friendly shape is converted once, on write, at the API boundary, and reads return native elements with no conversion
- [x] #2 convertToExcalidrawElements is gone from the delivery path, along with restoreBindings, planLabelExpansion, adoptReusedLabelIds, dropSpentLabelSeeds, recenterBoundShapeTextElements and rescueStrayBoundTextElements
- [x] #3 Every element the converter writes carries the fields Excalidraw requires, with no field left absent for the renderer to invent
- [x] #4 The TASK-071 browser check asserts zero changed elements and is part of bun run test
- [x] #5 Text width and height follow whichever of TASK-070 three outcomes holds, and if it is the fallback, the limitation is written into ADR 0015 rather than left implicit
- [x] #6 bun run test is green; check-labels and check-obsidian-md may be rewritten rather than preserved
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Productionise stage 3's measurer into src/core (font-file, font-layout, fonts, measure-text), cache in kept(), pin it with check-text-metrics against Chrome's numbers.
2. Fix check-fixed-point's font gate: document.fonts cannot tell a loaded family from an absent one, so gate on a known Chrome width instead.
3. Correct src/core/expand-elements.ts and run it at the API write boundary, so the board holds native elements.
4. frontend/src/canvas/elements.ts stops converting on read; delete the six correction passes and the two label helpers behind them.
5. Flip BASELINE to {}, add test:browser to the chain, empty the skip list, fold the browser job into the suite job.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Landed in six commits on a worktree branch off main (1908548..32d5305).

WHAT THE TWELVE CONSTANTS TURNED OUT TO BE. Section 1C compares our converter against convertToExcalidrawElements, and that converter is the one being deleted. The property that decides is the fixed point, so it was measured directly: with the frontend's conversion removed and nothing else changed, a rendered board came back with only `index` rewritten, on 5 of 12 elements. Adopted, because they are Excalidraw's own DEFAULT_ELEMENT_PROPS and AppState and so are what a hand-drawn element carries: fontFamily 5, fontSize 20 for a standalone text and for both kinds of label, strokeWidth 2 on a bound text, textAlign left and verticalAlign top on a standalone text, freedraw's lastCommittedPoint/pressures/simulatePressure, elbowed on arrows only. Rejected, each with a reason asserted in check-labels: roundness null (currentItemRoundness is round, so this would square-corner agent-drawn boxes only), freedraw strokeWidth 1 and absent strokeColor (that converter does not handle freedraw at all, and absent is not a value a stroke can have), and the half-stroke arrow inset (arrowhead clearance belonging to the deleted converter).

TWO FINDINGS THAT BEAR ON LATER STAGES. Excalidraw does not re-measure a text element it is handed, so a wrong width is accepted silently and the widths in a note have to be right rather than close; the fixed-point check's 'plant something it must correct' probe moved from a width to a duplicated index. And `a${n}` indices stop increasing at ten, which is why every board past nine elements was handed indices Excalidraw had to repair.

THE STAGE 2 PROPERTY SURVIVED by moving to where the name is chosen: expand-elements mints a label's id through labelTextIdFor at the point of conversion, against the ids the document and the board already hold, struck-out elements included. planLabelExpansion and adoptReusedLabelIds are deleted and check-labels asserts both properties directly (a label is named labelTextIdFor(container); a cleared label's name is not handed to its replacement).

VERIFICATION. bun run test green, 19 of 19 suites, including test:browser reporting 0 of 12 elements changed. Revert-proofs: dropping GPOS kerning fails 5 text-metrics checks, the chained-context GSUB lookup 4, shaping across a space 2, the range-based face rule 1, ignorables 1, reading line heights from the bundle 9; reverting the font gate fails the new 'measured the scene in it' check with the fallback widths; taking test:browser out of the chain or leaving it in SKIPPED each fails check-ci-suites.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-20 22:30
---
Deviation worth a reviewer's eye on AC 3. Four of the twelve rows in server-is-the-truth.md 1C are deliberately NOT adopted, because that table records what convertToExcalidrawElements produces and not what Excalidraw wants: roundness null on a rectangle (currentItemRoundness is 'round', so adopting it would square-corner every agent-drawn box while hand-drawn ones stayed round), freedraw strokeWidth 1 and an absent strokeColor (that converter does not handle freedraw at all, which is why the frontend routed freedraw around it), and the half-stroke inset on a bound arrow's points (arrowhead clearance belonging to the converter being deleted). Each rejection has an assertion and a written reason in check-labels.mjs, and the arbiter for all twelve is check-fixed-point, which renders in a real browser and reports zero.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
src/core/expand-elements.ts is the only converter and it runs at the API write boundary, so a labelled box is a box and its text element from the moment it is written and nothing converts on the way out (ADR 0015). The frontend's convertToExcalidrawElements call and the six passes that corrected it are gone, along with planLabelExpansion and adoptReusedLabelIds. Text width is measured by src/core/measure-text.ts, a pure-JS measurer over the woff2 subsets Excalidraw ships, agreeing with Chrome to 0.0012 px; height is fontSize x lineHeight x lineCount. Verified by scripts/check-fixed-point.mjs, which renders the board in a real headless Chrome and now reports 0 of 12 elements changed against a baseline of 8, and which is in the bun run test chain with an empty skip list. Its font gate was rewritten first, because document.fonts cannot tell a loaded family from an absent one and the check had been measuring against Chrome's last-resort font. bun run test is green: 19 suites, check-labels rewritten to 169 checks around the one converter, check-text-metrics added at 70.
<!-- SECTION:FINAL_SUMMARY:END -->

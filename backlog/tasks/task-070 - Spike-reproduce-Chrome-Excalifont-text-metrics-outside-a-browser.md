---
id: TASK-070
title: 'Spike: reproduce Chrome Excalifont text metrics outside a browser'
status: To Do
assignee: []
created_date: '2026-08-20 20:14'
labels: []
dependencies: []
references:
  - docs/design/server-is-the-truth.md
  - src/core/expand-elements.ts
  - docs/adr/0015-the-vault-is-the-truth-and-the-agent-shape-is-input.md
priority: high
type: spike
ordinal: 70000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stage 3 of docs/design/the-plan.md. A gate on the converter work, not part of it. Timebox it: its job is to pick between three quite different amounts of work, and it is worth stopping and reporting the moment it can.

THE QUESTION. Under ADR 0015 the server converts the agent-friendly shape once, on write, and a headless agent must be able to create a labelled shape with no browser open. Excalidraw's width for a piece of text is exactly what `measureText` returns: this was proved by running `convertToExcalidrawElements` headless with a deliberately fake measurer fixed at 7 px per character, which produced a twenty-character string 140 px wide and "AuthService" 77 px wide. There is no estimation and no correction anywhere in that path. Whatever measures, decides.

So a server that estimates reproduces today's bug under a new name. Our current estimate is 0.6 x fontSize per character, and it is not a bad estimate that needs tuning, it is the wrong kind of answer: on one string it is 76.7 px too wide, and every label height it writes is three times the truth.

WHAT WAS ALREADY TRIED AND DID NOT WORK. Excalidraw ships Excalifont in its own package at `node_modules/@excalidraw/excalidraw/dist/prod/fonts/`, as seven woff2 subsets. Six of the seven do not carry Latin glyphs at all and fall back to `.notdef`. Reading the right 217-glyph subset with fontkit 2.0.4 and summing advance widths still does not reproduce Chrome, at fontSize 20:

  String                   Chrome     fontkit    Off by
  a standalone caption     163.271    203.660    40.4
  AuthService               99.971    114.500    14.5
  Queue                     52.197     58.760     6.6
  Gate                      37.754     48.920    11.2
  gRPC                      47.803     52.360     4.6

The ratio is not constant, so it is not a units-per-em mistake.

WHAT TO DO FIRST, AND IT IS SMALL. Load Excalifont explicitly in a page, wait for `document.fonts.ready`, measure those same five strings, and see whether Chrome's numbers move. The leading hypothesis is that Chrome fell back to a system font because Excalifont had not finished loading when the original numbers were read. Two other candidates, untested: Excalidraw applies something on top of the raw advance, or fontkit picks different glyphs than the browser's shaper.

THE THREE OUTCOMES, AND WHAT EACH MEANS FOR THE PLAN.

- Chrome's numbers move to match fontkit. The font had not loaded, a pure-JavaScript measurer works, and the converter stage has no native dependency. Best case, and the converter stage is a morning's work plus the twelve constants.
- They do not move. The server needs a real canvas with Excalifont registered, something like `@napi-rs/canvas`, which is a native dependency on a box that has none. Then the question becomes whether its metrics match Chrome to the pixel, which is also untested, and whether it installs and runs here at all.
- Neither works. The server writes the geometry it can compute and marks text unmeasured, and the first browser to see it measures and reports. That is a real second representation, confined to two fields on one element type instead of fifteen fields on all of them. It is worth taking over shipping widths that are 76 px wrong, but it does not satisfy ADR 0015 and the ADR should say so rather than being quietly weakened.

DELIVERABLE. A written answer, in docs/design/, naming which of the three it is and with the numbers behind it. No production code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The five strings are re-measured in a page with Excalifont explicitly loaded and document.fonts.ready awaited, and the numbers are recorded
- [ ] #2 The answer names which of the three outcomes holds, with the measurements behind it
- [ ] #3 If a native canvas is the answer, it is installed on this box and its metrics compared against Chrome to the pixel, or the attempt and its failure are recorded
- [ ] #4 The finding is written to docs/design/ and no code under src/ or frontend/ is changed
<!-- AC:END -->

---
id: TASK-070
title: 'Spike: reproduce Chrome Excalifont text metrics outside a browser'
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 20:14'
updated_date: '2026-08-20 21:21'
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
- [x] #1 The five strings are re-measured in a page with Excalifont explicitly loaded and document.fonts.ready awaited, and the numbers are recorded
- [x] #2 The answer names which of the three outcomes holds, with the measurements behind it
- [x] #3 If a native canvas is the answer, it is installed on this box and its metrics compared against Chrome to the pixel, or the attempt and its failure are recorded
- [x] #4 The finding is written to docs/design/ and no code under src/ or frontend/ is changed
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Re-measure the five reference strings in a page that explicitly loads Excalifont's woff2 subsets and awaits document.fonts.ready, and compare against the same page's measurement before the font is added.
2. Read Excalidraw's own measuring path in dist/prod/chunk-FX7ZIABN.js to settle whether anything is applied on top of measureText.
3. Build a pure-JS measurer from the shipped woff2 files, using node:zlib brotli, and widen the comparison until it either matches Chrome everywhere or fails in a way that names the outcome.
4. Compare across all seven fonts Excalidraw ships as files, every ASCII pair, single codepoints, a generated corpus, and six font sizes.
5. Time it, run it under bun as well as node, and write the finding to docs/design/.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
OUTCOME 1. A pure-JavaScript measurer reproduces Chrome exactly, with no native dependency. Finding: docs/design/measuring-text-outside-a-browser.md. ADR 0015 does not need amending.

The font-load hypothesis was right, and the reference table in server-is-the-truth.md was taken on a fallback font. In one page, one canvas context, one font string, measured before and after adding Excalifont's seven FontFaces: 'a standalone caption' 163.2715 -> 203.6598, 'AuthService' 99.9707 -> 114.4999, 'Queue' 52.1973 -> 58.7599, 'Gate' 37.7539 -> 48.9200, 'gRPC' 47.8027 -> 52.3600. The left column is also exactly what Chrome returns for an invented family name and for 20px serif, so it is the last-resort font. The right column is what fontkit said all along.

TASK-071's contrary result is explained rather than contradicted: document.fonts.check('20px Excalifont') returned true in my probe BEFORE any FontFace was added, because a family absent from the font set has nothing pending. It cannot distinguish loaded from nonexistent, so it is not evidence about which font was measured.

Summing advance widths is not enough. Five things sit on top, each found by measurement: GPOS pair kerning (without it 'postgres://primary' is 4.00px too wide at fontSize 20), GSUB ligatures reached through a chained-context lookup ('office' 1.82px), no shaping across a space because Blink shapes word by word (Liberation Sans ' A' 5.518px at 100px), face selection by @font-face unicode-range with last declaration winning rather than by cmap coverage (63 Nunito ASCII pairs), and U+00AD laid out as zero width.

Agreement: 63,175 ASCII pairs across all 7 shipped families, 5,600 single codepoints, 57,600 Latin/Latin-Ext pairs in Excalifont, a 607-string corpus, six font sizes. Nothing over 0.02px; worst residual 0.0012px, and it is floating point. Independent cross-check: server-is-the-truth.md records the true AuthService label width as 90.54px from a real browser render; the measurer says Virgil at 16px gives 90.544.

Height needs no measurer at all. getTextHeight is fontSize * lineHeight * lineCount, with lineHeight a per-family constant in Excalidraw's FONT_METRICS.

Cost: 746 lines of throwaway JS, no new package, fonts already on disk (84KB). 4.4ms (node) / 15.9ms (bun) to parse Excalifont's subsets once per process, then 3.8us / 4.2us per measurement of 'AuthService'.

Not established: Nunito kerns across its own subset boundary and I cannot reproduce it (511 of 58,564 Latin/Latin-Ext pairs, worst 2.34px at fontSize 20); the two files number their kerning classes differently, so nothing in them says what that kern is. Excalifont shows none of it. Helvetica (fontFamily 2) is local:true in Excalidraw's registry, ships no file, and is unmeasurable server-side by anyone. Xiaolai and Segoe UI Emoji untested. One browser, one box, dpr 1.

AC 3 was not reached: a native canvas is not the answer, so none was installed. Verified no production code changed: git status shows only this task file and the new doc.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Outcome 1: a pure-JavaScript measurer reproduces Chrome's text width exactly, with no native dependency, reading the woff2 subsets already shipped inside @excalidraw/excalidraw. ADR 0015 does not need amending and stage 5 can convert once, on write, with nothing left for a browser to correct.

The plan's cheapest hypothesis was right. The Chrome column in server-is-the-truth.md was measured on the last-resort fallback font: in one page, one canvas context and one font string, 'a standalone caption' measures 163.2715 before Excalifont's FontFaces are added and 203.6598 after, and 163.2715 is also exactly what Chrome returns for an invented family name and for 20px serif. The advance-width sum that was reported as wrong was right.

Beyond advance widths the measurer needs GPOS pair kerning, GSUB ligatures through a chained-context lookup, no shaping across a space, face selection by @font-face unicode-range with last declaration winning, and U+00AD as zero width. With those it agreed with Chrome on 63,175 ASCII pairs across all seven shipped families, 5,600 single codepoints, 57,600 Latin/Latin-Ext pairs, a 607-string corpus and six font sizes, worst disagreement 0.0012 px. It also reproduces, to three decimals, the one independent number already in the repo: the AuthService label's true width of 90.54 px.

Height needs no measurement at all: getTextHeight is fontSize * lineHeight * lineCount.

Verified by measuring in headless Chrome 150 through agent-browser against a throwaway server on port 41833, and by running the measurer under both node 24.18.0 and bun 1.3.14. No code under src/ or frontend/ was changed. Written up in docs/design/measuring-text-outside-a-browser.md, which also records what could not be established: Nunito's cross-subset kerning, Helvetica being a local system font, and Xiaolai.
<!-- SECTION:FINAL_SUMMARY:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-20 21:11
---
Measured while building TASK-071's browser check, which can now put strings on a board and read Chrome's own measurement back. The section 3 hypothesis that Chrome had fallen back to a system font because Excalifont had not loaded is ruled out: five standalone texts at fontSize 20 with fontFamily 5, rendered with document.fonts reporting Excalifont loaded, came back at 163.271484375, 99.970703125, 52.197265625, 37.75390625 and 47.802734375 for 'a standalone caption', 'AuthService', 'Queue', 'Gate' and 'gRPC'. Those are the Chrome column of the table to three decimals, so the font was loaded when that table was taken and the 4.6 to 40.4 px fontkit gap is real. That leaves the other two candidates: Excalidraw applies something on top of the raw advance, or fontkit picks different glyphs than the browser's shaper. bun run test:browser is the cheapest way to take more readings — put text on the board, read what the browser holds.
---
<!-- COMMENTS:END -->

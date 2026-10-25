---
id: TASK-520.07
title: The core shapes text, and every picture draws the glyphs of the core
status: In Progress
assignee:
  - '@claude'
created_date: 2026-10-24 12:54
updated_date: '2026-10-25T13:09:00Z'
labels:
  - renderer
dependencies:
  - TASK-520.05
  - TASK-520.06
documentation:
  - >-
    docs/adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
parent_task_id: TASK-520
ordinal: 927000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today the canvas of the place that draws measures text (Pretext over the browser canvas, or @napi-rs/canvas under Bun), so two places can measure a word differently and a picture holds only where its fonts load. ADR 0057 moves shaping into the core and puts glyph runs on the scene, so every painter draws the same glyphs and an SVG needs no font. Known costs, decided by the user on 2026-10-24: glyph paths are drawn without hinting, a picture with many distinct glyphs grows, and the words must stay findable and readable by assistive technology.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The core measures and breaks every run with harfrust and skrifa on the bundled font files, and Pretext and canvas measurement are gone from the renderer
- [ ] #2 The scene carries glyph runs with the string of each run, and the SVG painter defines each glyph a picture uses once and writes each string as accessible text
- [ ] #3 An exported SVG draws its words in Chromium and Firefox with no diagram font installed or embedded, and a search of the page finds them
- [ ] #4 Card titles, notes and labels at 1920x1080 are compared with the pictures before the change, and the screenshots are recorded in the task notes
- [ ] #5 No corpus picture is worse on the measures of ADR 0039
- [ ] #6 AGENTS.md states the new text invariant, and a test holds every painter to the glyph positions of the core in place of tests/system/browser/measured-text.test.ts
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add crates/archboard-text. It shapes a run with harfrust and draws an outline with skrifa. The four bundled .ttf files are built into the core. It breaks a paragraph to a width with UAX #14 and the two tailorings of the browsers. Spaces hang, and an overlong word breaks between graphemes. It ports the balanced width and the fewer-lines search of Pretext.
2. Make archboard_scene::measure the one measuring module that the layout crates and painters ask. Delete the host Measure and Text traits. Port measurement.ts, wrap-widths.ts and the far-size fitting into it. Add measureBoard to the WASM API.
3. Make the Text of the scene a glyph run that keeps its string. archboard-svg defines each glyph once. It writes each run as uses of the glyphs, then transparent text stretched with textLength.
4. Delete Pretext and canvas measurement from the renderer. Delete the fonts choice, the served diagram fonts, @napi-rs/canvas and the face loading of the rasterizer.
5. Replace measured-text.test.ts with drawn-glyphs.test.ts. Change a test only where the glyph markup or the removed fonts are the cause.
6. Measure before and after with the ADR 0039 scorecard, the render corpus and 1920x1080 dark screenshots. Make sure that an exported SVG draws in Chromium and Firefox with no diagram font installed.
7. Update the docs: the AGENTS.md invariant, the archboard-dev skill, boundaries, typed-scene, layout-rules and the fonts README.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Text module

crates/archboard-text is the one text module. Its interface is shape(face, words), width(face, words, size), outline(face, glyph) and Paragraph (lines, line_count, natural_width, balanced_width, fewer_lines_at). The four diagram .ttf files are built into the core with include_bytes. The layout crates and painters ask only archboard_scene::measure, which wraps it. The Text trait of archboard-flows and the Measure trait of archboard-scene are deleted.

## Wrapping compared with Pretext

The paragraph keeps the rules of Pretext. Spaces hang. A fit adds the widths of words shaped one at a time, with a tolerance of 0.005. An overlong word breaks between graphemes. The balanced width is the same binary search. Breaks come from UAX #14 with two tailorings: a line can end after any space, and a line never ends after a slash.

Widths are hundredths of a pixel held in single precision, because that is the number the old canvas gave. With exact widths the scorecard changed 73 Track and 104 Blocks drawings. With this rule it changes 3 and 12. In a probe of 270 strings, 265 widths are bit-equal to @napi-rs/canvas. The other 5 differ by 0.01 at a rounding edge.

Known differences: Onest and DM Mono have no glyph for some characters, such as the arrows in DM Mono, Greek, and ─↔⇄✗√∞ in Onest. The core draws .notdef for them, where a browser used a fallback font. In the corpus, 4 of 586 pictures cut a far-card line one character later. An example is "Viewer entry point → Repor…" for "Viewer entry point → Repo…".

## SVG

archboard-svg defines each glyph that a picture draws once in the top defs, as a path in font units with the id g{s4,s5,m4,m5}-{glyph}. Each run is an aria-hidden group, translated to the run and scaled to its size, that holds one use per glyph. After the group comes a text element with the words, fill transparent, and textLength with lengthAdjust spacingAndGlyphs over the advance of the core. A picture has no @font-face and no font-family.

## AC3: Chromium and Firefox with no diagram font

The fontconfig /tmp/t7/ac3/fonts.conf lists DejaVu only. fc-list under it shows 22 faces and no Onest or DM Mono. Nothing is embedded.
- Chromium screenshot of an exported dark SVG: /tmp/t7/ac3/chromium-board-rasterizer-dark.png. The words draw in the Onest shapes.
- Firefox 158 headless screenshot of the same SVG: /tmp/t7/ac3/firefox-board-rasterizer-dark.png. It is the same picture.
- Page search through window.find over the SVG in /tmp/t7/ac3/search-light.html. Chromium (dump-dom title) and Firefox (/tmp/t7/ac3/firefox-search-light.png) both say "Archboard server=true, Skill evaluation=true, Photographs a board=true, document faces: 0".

## AC4: screenshots at 1920x1080, dark

Before: /tmp/archboard-task-520.07/before/screens/. After: /tmp/archboard-task-520.07/after/screens/. Diffs: /tmp/archboard-task-520.07/after/screens-diff/. Each folder holds board-rasterizer-rasterizing, command-dispatch-routing, archboard-server-overview, command-dispatch-sequence and command-dispatch-flowchart, each as -fit, -100 and -cli, with manifest.json. Cards, notes and labels stand at the same places with the same breaks. The glyphs are unhinted, so the words are a little softer at 100 percent, as decided on 2026-10-24.

## AC5: ADR 0039 scorecard, 337 drawings per engine

Track totals, before and after:
- fit 106.40 and 106.40, megapixels 5139.99 and 5139.99, crossings 31399 and 31399
- route length 34334947 and 34334948, label reach 481015 and 481015
- routes through cards 0 and 0, labels off runs 0 and 0

 Three drawings changed. Two are worse by 2 units of route length (Browser application *TASK-482.07 and TASK-319 after TASK-482.07). One is better by 1.

Blocks totals, before and after:
- fit 116.23 and 116.23, megapixels 4042.73 and 4042.80, crossings 66962 and 66924
- route length 37558815 and 37562062, label reach 268303 and 267963, shared corridor 603817 and 603821
- labels off runs 3 and 3, routes through cards 0 and 0

 Twelve drawings changed. Seven are worse on one measure or more. Six of them are worse by 1 to 3 units of route length or shared corridor. Semantic renderer TASK-520.06 is better on 3 measures, for example crossings 150 to 112. It is worse on 6, for example route length 97710 to 100895. Three Live panes pages are 1 px wider.

So AC5 does not hold to the letter: 9 of 674 drawings are worse on one measure or more. Files: /tmp/archboard-task-520.07/after/scorecard-{track,blocks}.txt.

## Corpus

Before: /tmp/archboard-task-520.07/before/corpus-full and corpus-svg. After: /tmp/archboard-task-520.07/after/corpus-full and corpus-svg. 0 of 36032 drawings changed size. Render time of the full corpus fell from 6045 s to 1987 s in total. In corpus-svg, 4 of 586 pictures changed words (the far-card cuts above).

## Size

The core WASM grew from 3,687,010 to 5,599,659 bytes, with the fonts, harfrust and skrifa. The 586 corpus SVGs took 371.9 MB with embedded fonts before. Without the font data they take 103.3 MB. Now they take 145.2 MB, which is 1.41 times the linked size.

## Tests changed, and why

- measured-text.test.ts is deleted. drawn-glyphs.test.ts replaces it and keeps the theme parity check. A mutation that moved glyphs 15 percent failed it.
- drawn-text.ts reads the face from the glyph ids and the width from textLength. The fonts registry is gone from the document.
- architecture.test.ts: the face registry test became "a picture draws its words in glyphs it defines and needs no font". The embedded-fonts test is deleted, because the fonts choice is gone.
- dataflow.test.ts: the face registry check and the embedded-fonts test are deleted, for the same reason.
- header-wrap.test.ts: its recount of lines used the host canvas. It now holds every line to the room of the slab and one line beyond the width of a card.
- flowchart-shapes.test.ts: the core resolves centring, so the test reads x plus half the width.
- measurement.test.ts: the check that a run width equals the host canvas width is gone, because both are now the core. The bounds stay.
- group-regions, palette-contrast, sequence-marks, export-title and export-legend read the ink of words from the glyph group, or allow the glyph group before a text.
- candidate-cancellation and join-candidates: the canvas warm-up installed the Bun host. They now install it themselves.
- rasterizer.test.ts: the faces-loaded count and the face-load refusal are deleted, because a picture has no face to load.
- shell-layout and shell-render-matrix: the diagram font resource check is deleted. browser-origin probes a diagram icon in place of the deleted fonts route.
- rasterize.test.ts and the skills capture tests: source.fonts and facesLoaded are gone from the receipt.

No test that pinned a pixel width or a byte snapshot changed.
<!-- SECTION:NOTES:END -->

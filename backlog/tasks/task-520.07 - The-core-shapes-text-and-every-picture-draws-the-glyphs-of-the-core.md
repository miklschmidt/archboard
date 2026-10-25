---
id: TASK-520.07
title: The core shapes text, and every picture draws the glyphs of the core
status: Done
assignee:
  - '@claude'
created_date: 2026-10-24 12:54
updated_date: '2026-10-25T14:51:00Z'
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
- [x] #1 The core measures and breaks every run with harfrust and skrifa on the bundled font files, and Pretext and canvas measurement are gone from the renderer
- [x] #2 The scene carries glyph runs with the string of each run, and the SVG painter defines each glyph a picture uses once and writes each string as accessible text
- [x] #3 An exported SVG draws its words in Chromium and Firefox with no diagram font installed or embedded, and a search of the page finds them
- [x] #4 Card titles, notes and labels at 1920x1080 are compared with the pictures before the change, and the screenshots are recorded in the task notes
- [x] #5 No corpus picture is worse on the measures of ADR 0039
- [x] #6 AGENTS.md states the new text invariant, and a test holds every painter to the glyph positions of the core in place of tests/system/browser/measured-text.test.ts
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

## User decisions of 2026-10-25

AC5: the user accepted the nine drawings that are a little worse. In Track, Browser application *TASK-482.07 and TASK-319 after TASK-482.07 are each 2 units of route length longer. In Blocks, six drawings are 1 to 3 units worse on route length or shared corridor. The user also accepted the Blocks trade on Semantic renderer TASK-520.06: crossings fell from 150 to 112, and route length rose about 3 percent, from 97710 to 100895.

Missing glyphs: the user asked for Noto fallback faces in the core.

## Fallback faces

The files are in packages/renderer/assets/fonts. All are under the SIL Open Font License 1.1, and the OFL text of each release sits beside them.
- NotoSans-Greek-Regular-v2.015.ttf, 20,124 bytes, and NotoSans-Greek-Medium-v2.015.ttf, 20,072 bytes. They hold U+0370-03FF.
- NotoSansSymbols2-Subset-v2.008.ttf, 78,076 bytes. It holds miscellaneous technical, geometric shapes, miscellaneous symbols, dingbats and U+2B00-2B59.
- NotoSansMath-Subset-v3.000.ttf, 92,116 bytes. It holds letterlike symbols, arrows, mathematical operators, box drawing, block elements and U+27C0-27FF.

The README records each source URL, release version and SHA-256. subset-fallbacks.sh is the subset command. It uses fonttools 4.63.0 from Nix, and two runs gave the same bytes.

The fallback order is in Face::fallbacks. A run uses its own face, then Noto Sans at the run's weight for Greek, then Noto Sans Symbols 2, then Noto Sans Math. Where no face has the character, the run uses its own face. A space and a grapheme's marks stay with the face of the run or the grapheme. Shaping cuts a run where the face changes. Measuring, breaking and the SVG glyph definitions all read those pieces. Each scene glyph names its face, and the SVG glyph ids are n4 and n5 for Greek, y4 for Symbols 2 and x4 for Math. No bundled face has an emoji such as ❌. Such a character stays a .notdef box.

The crate tests are a_character_its_face_lacks_is_drawn_from_the_first_fallback_that_has_it (α, Ω, ✗, ■, ─, √, ⇄, and → in DM Mono), a_character_its_face_has_stays_in_its_face, and every_face_shares_one_unit. A picture with these characters, made with only DejaVu installed, is /tmp/t7/ac3/chromium-fallback.png.

The core WASM grew from 5,599,659 to 5,813,985 bytes, an increase of 214,326 bytes.

## The four pictures that cut a far-card line one character later

They still differ, and the fallback faces do not change them. Onest has a glyph for →. In Skill evaluation TASK-482.07 One batch: logic, the far card of step RHgiyi2m has a room of 265.08 - 72 - 14 = 179.08. "Batch orchestrator → Pinn…" adds up to exactly 179.08, with each character's width bit-equal to the old canvas. So the cut lands on an exact tie, and the last bits of the card width decide it. The other three pictures cut the same kind of line.

## Rerun with the fallback faces

The scorecard did not change: Track has 3 drawings changed, and Blocks has 12. The corpus did not change: 0 of 36032 drawings differ in size, and the 586 corpus SVGs still take 145,227,288 bytes. Folder: /tmp/archboard-task-520.07/after-fallback.

## Board proposals, adopted

Five boards were adopted as TASK-520.07. Renderer layout is at v77 (current tTuRFlNL). Semantic renderer is at v121 (current wnkTiVu4). Board rasterizer is at v77 (current g6ghgAxA). Board viewer is at v133 (current BuLCyzn1). Browser application is at v134 (current VXLz7ZFo). Each proposal carries the board's scope as its summary.

Renderer layout:
- Pretext (RvOyWmEb) and Host canvas (dYxhsEhY) are removed, with their three relationships and the canvas steps of "Sizing a card".
- Measured text (kHpIix5b) is now a module bound to crates/archboard-scene/src/measure (measure_board at measure/board.rs:51).
- Text shaping is new. It is bound to crates/archboard-text/src (shape at shape.rs:69, Paragraph at paragraph.rs:247, the faces and Noto fallbacks at faces.rs:81). Measured text calls it ("shape and break every word", measure/mod.rs:47 Paragraph::new).
- "Draw and measure" now says it measures in the renderer core.
- "Sizing a card" is redrawn with View dispatcher, Measured text and Text shaping, and step ids are kept. Paragraph::new shapes the words (paragraph.rs:68, :230). natural_width is at cards.rs:201. lines(width) shapes each line whole (paragraph.rs:287-292). The inner per-line canvas loop is gone, because lines() gives each line its whole width. The "painted width wins" rule is at cards.rs:213-219.
- Both walkthrough beats that named Pretext and the canvas are rewritten. The summary of the "Sizing a card" view is updated, and the "Draw and measure" view now includes Text shaping.
- Correction: the measuring calls from View dispatcher (TPRWw9F4, K9SFgjvi, 86rBqUC3) are now anchored at measure_board. The anchor measureArchitecture lives in packages/renderer/src/shared/rules/render/measure.ts, which no part binds, so it gave ANCHOR_MISMATCH. This follows how the board anchors painting at paint_architecture.

Semantic renderer:
- Host canvas (gUN928v4) is removed, with BzVsPvqY, V6JJ4OjE, tmrkphkd and qbz0QY1B.
- Measured text (J3yMo4ag) is rebound to crates/archboard-scene/src/measure.
- "Flows hand-off -> Measured text" (oCH6TGpi) is removed, because flows.ts no longer measures (flows.ts:58, its only host call is track).
- Two relationships are added: Sequence layout -> Measured text (sequence/rows.rs note_lines) and Flowchart -> Measured text (flowchart/mod.rs:224 measure_node).
- Descriptions are updated:
  - Measured text.
  - SVG document: each glyph is defined once and the words are written in no ink (archboard-svg glyphs.rs:103-145).
  - Renderer host: no font bytes (host.ts:43-70).
  - Bun host installation: no canvas and no fonts (bun-host.ts installBunHost).
  - Flows hand-off: it answers only the track engine.
  - Paint hand-off: it adds no faces (paint.ts:26-38).
  - Renderer core: measureBoard is added (renderer-wasm scene.rs:27), and "through the host's canvas" is dropped.
  - Sequence layout and Flowchart: they measure through the core.
  - Browser application: it loads no faces (browser-renderer.ts:63-79).
  - Scene: its runs are glyph runs (scene/text.rs:17-53).
- Edge labels: "drawSequence, and drawFlowchart with the track engine", "paintDocument, as JSON" and "renderBoard" (the "linked faces" is gone).
- "Draw a view" and "Draw a sequence" now run the measuring steps between the core's layouts and Measured text. The steps f8Ma7jiv, gLbCi3Gp, S53p7nFg and kdVOvXlC are removed.
- In the "Host seam" view, Measured text and Host canvas are replaced by Renderer core. Two beats are rewritten. Every beat of that walkthrough now names its view, which fixes WALKTHROUGH_VIEW_MISSING in the touched walkthrough.
- Correction: ezsxPVcK, YlwhO14p and xnf4S2ZR are anchored at measure_board, for the same reason as on Renderer layout.
- Dropped: a Text shaping part on Semantic renderer. Only Renderer layout needs it. Here Measured text's description names archboard-text.

Board rasterizer:
- The edge label "the SVG, faces embedded" is now "the SVG, its words drawn as glyphs". Its stale anchor drawRequest is gone. It now points at the render route the request reaches (semantic-board-routes.ts:165 renderRoute), because renderSemanticBoardOnServer is in server-lifecycle and gave ANCHOR_MISMATCH.
- Page readiness description: there is no face to wait for (page.ts:26-36, :54-58).
- The "One rasterize" flow:
  - The readiness note and its return now read the SVG's size.
  - The decision "Did every declared face load?" is now "Did the page report its readiness?", with the alternatives "no report" and "reported" (checkedReadiness throws only on a malformed answer, page.ts:54).
- Beat BnjBLsWM is rewritten, and its walkthrough's beats name the Rasterizing view.
- Kept: Replay page still waits for document.fonts (apps/web frame-readiness.ts:65). Those are the page's own faces.

Board viewer: the responsibility of "Draw here" (F90402mH) no longer names the tab's canvas.

Browser application: the responsibility of "Browser renderer" (hDWpDois) no longer names the tab's canvas.

## Code check, diff method

`archboard check --code --variant TASK-520.07` was compared with the same run without --variant: no line is new (no `>`). 30 lines cleared (`<`):
- Renderer layout: 17 ANCHOR_PATH_MISSING into the deleted measurement.ts and canvas-text.ts.
- Semantic renderer: 4 ANCHOR_PATH_MISSING and 7 ANCHOR_SYMBOL_MISSING (measureNoteLines, measure, loadDiagramFaces, nodeOffscreenCanvas, noteLines, measureNode, nodeMeasured).
- Board rasterizer: drawRequest.

After adoption, the full run against the run before adoption shows the same 30 cleared and nothing new. `archboard check` reports no diagnostics. The check reads .rs as text only (skip text-only), so every Rust anchor was tested by name, and I read each one by hand.

## Footprint

Base: 47e05a3ff, found with the trailer command (TASK-520[.]07). Each answer's `current` is the parent of its proposal. Every commit in the range is a TASK-520.07 commit.
- Renderer layout:
  - namedAndChanged: Measured text and Text shaping.
  - changedNotNamed: Architecture painter (9a6bdd61e). paint_region no longer takes the measuring context. That is internal.
- Semantic renderer:
  - namedAndChanged: Sequence layout, Measured text, SVG document, Bun renderer, Renderer host, Board answer, Flowchart, Bun host installation, Renderer core, Scene, Paint hand-off, Flows hand-off.
  - changedNotNamed (all 9a6bdd61e, all internal):
    - View dispatcher: imports measureArchitecture from render/measure.ts, and the core now takes the far size.
    - Subject atlas: page.rs measures "Planned" with measure::width and sets it with Text::set.
    - Architecture painter and Sequence painter: the measuring context argument is gone.
    - Near and far content, Export frame and Export legend: they measure through measure::width and truncate.
    - Bun measurement entry: an import path changed.
- Board rasterizer:
  - namedAndChanged: Raster session and Page readiness.
  - changedNotNamed: Receipt (source.fonts and facesLoaded are gone from the schema; its responsibility still holds) and the Semantic rasterizer directory.
  - namedNotChanged: Rasterizer, named only by steps under the renamed decision. That is normal.
- Board viewer:
  - changedNotNamed: Local pictures. The DrawBoard type no longer omits fonts. That is internal.
  - Draw here is skipped as a drill-down. git log shows 9a6bdd61e on browser-renderer.ts, and the proposal names it.
- Browser application: Browser renderer is skipped as a drill-down (packages/renderer/src/ui changed in 9a6bdd61e, and the proposal names it).

## Behind (step 7)

After adoption, the five adopted boards read 0 behind. These other boards are behind because of 9a6bdd61e, and each is still right:
- Archboard: the renderer and board packages. Its renderer says "Draws a board as a picture, in the browser or under Bun".
- Archboard server and Live panes: HTTP application. The /assets/diagram-fonts route is gone, and neither board draws it.
- Archboard server routes: Board routes. The fonts selector is gone, and nothing on the board names it.
- Command interface: Board client, Rasterize, Render, Views and Commands. The fonts option and the receipt fields are gone, and no description names them.
- Skill evaluation: Captures. source.fonts and facesLoaded are gone, and they are not on the board.

The other behind boards (Agent workbench, Codex workhorse, Codex session, Voice coordinator, Board persistence) count no TASK-520.07 commit. The workbench subtitles still measure with document.fonts (packages/workbench/src/ui/rules/subtitles/measured-lines.ts:42), which this task did not change.

## Pictures, dark, after adoption

/tmp/t7b/pics:
- rl-overview and rl-sizing
- sr-layout, sr-hostseam and sr-drawview
- br-proved and br-one
- bv-overview and ba-overview

The proposal pictures rl-sizing-prop and sr-seq-prop show the removals drawn as removed. Every picture draws its words in the core's glyphs. Titles, responsibilities, edge labels, step labels, notes and diamond questions read cleanly at 1x. Nothing is clipped, and no .notdef box appears.

## Stale anchors from TASK-520.03 (commit 5eab5afab)

These were corrected in place on Semantic renderer's current variant before the branch:
- 0s8raCUw: now architecture.rs paint_edge_line. The label is "rounded curves", because the painter places labels itself with label_anchor_of in geometry.rs.
- ryvCaAp5: now export.rs symbol_of. Its mark entry calls standing_pin_at (legend_symbols.rs:220).
- t5CUCz5T: now sequence.rs paint_frame, which calls paint_heading_views (sequence_frames.rs:60). The description names the Rust functions.
- uGaKoVb8: now bun-host.ts loadCore.
- o1aDteuC: now sequence.rs paint_step. Its line comes from step_path (sequence_messages.rs:112).
- 7ZIx3pOn: now export.rs entries_of, which legend_of calls.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The core shapes and breaks every run of text. crates/archboard-text (harfrust, skrifa, unicode-linebreak, unicode-segmentation) holds the bundled faces and Noto fallback subsets for Greek, symbols and math (sources, versions, SHA-256 and the subset command in packages/renderer/assets/fonts/README); the layout crates and painters measure through archboard_scene::measure, and measureBoard replaces the TypeScript measurement. Pretext and canvas measurement, @napi-rs/canvas, the font route and the face waits are gone from the renderer. The scene carries glyph runs with their strings; the SVG defines each glyph once and writes each run's words as transparent accessible text, so an exported SVG draws its words with no font installed and a page search finds them (checked in Chromium and Firefox). Widths are hundredths in single precision as the canvas gave them, so only 3 Track and 12 Blocks scorecard drawings changed and the browser and the server now draw the same layout; 9 are slightly worse and one Blocks view trades 38 fewer crossings for about 3% more route length, both accepted by the user on 2026-10-25. Dark screenshots at 1920x1080 before and after are recorded in the notes. tests/system/browser/drawn-glyphs.test.ts holds every painter to the core's glyphs in place of measured-text.test.ts, and AGENTS.md states the new invariant. The WASM grew from 3.7 MB to 5.8 MB. Adopted on Renderer layout v77, Semantic renderer v121, Board rasterizer v77, Board viewer v133 and Browser application v134.
<!-- SECTION:FINAL_SUMMARY:END -->

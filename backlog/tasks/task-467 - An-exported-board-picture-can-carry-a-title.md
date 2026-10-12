---
id: TASK-467
title: An exported board picture can carry a title
status: Done
assignee:
  - '@claude'
created_date: '2026-10-12 00:35'
updated_date: '2026-10-12 02:18'
labels: []
dependencies: []
priority: medium
ordinal: 812000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An exported SVG or PNG is only the picture. A reader who meets it in a pull request or a document has no name for what it shows, which view, or which variant, so every author writes the caption by hand. A title drawn into the export names it once.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An option on `semantic render` and `semantic rasterize` draws a title above the picture; the text is given by the caller, or defaults to the board, view and variant names when asked for
- [x] #2 The title is measured with the diagram fonts, follows the theme (light, dark and the theme-following choice), and never overlaps or shifts the board's drawing
- [x] #3 Without the option, the output is byte-identical to today
- [x] #4 A test owner covers the title in SVG and PNG; the `archboard-pr` skill uses it in place of the hand-written title line
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. CLI: --title [text] on semantic render and semantic rasterize. With text, that text; bare, the board's name, the view's and the variant's, and what the picture is compared with when it draws the comparison. Wire: title=<text> or titled=on on /api/semantic-boards/render.
2. renderBoard (transformers/semantic-renderer/board.ts) resolves the default from the answer's identity; the renderer request carries the text.
3. New lib/svg/export-frame.ts: after pageFor, wraps the painted page with a title band above it, measured with the diagram sans at 500 through the host canvas, coloured by the palette's foreground token so it follows light, dark and auto. The drawing is translated whole, never re-laid out; the page widens when the title is wider than the picture; atlas boxes move with the drawing. Without a title the page is returned untouched, so the bytes are today's.
4. Tests: renderer module owner for the band (measured width, no overlap with the drawing, drawing unchanged under the translate, absent = identical bytes); tests/system/semantic-boards/rasterize.test.ts for the CLI in SVG and PNG.
5. archboard-pr renders.md and SKILL.md: the title option replaces the hand-written title line.
Boards: Semantic renderer gains Export frame (proposal Semantic renderer@TASK-467).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions (smallest product): one option, --title [text], on both commands. With text it draws the text; without it, the board, the view, the variant and, when the comparison is drawn, the variant it is compared with. The render route reads title=<text> or titled=on. The title band is DIAGRAM_MARGIN + 24 tall, set at 18 px in the card-title face, measured with the diagram faces and painted with palette.foreground, so it follows light, dark and auto. The drawing is moved down whole in a translate group with its atlas, never laid out again; a title wider than the picture widens the page. The accessible name starts with the drawn title.

Shape: the renderer request gains one field, frame (title now, legend in TASK-468), read by lib/svg/export-frame.ts. pageFor and plannedTitle moved from the renderer index to lib/svg/planned-frame.ts beside framedAsPlanned, which keeps index.ts under its 600-line limit.

archboard-pr: renders.md draws with --title in place of the hand-written title line; a stack passes --title "<text>".

Tests: src/runtime/semantic-renderer/tests/export-title.test.ts (Track, Blocks and a sequence view: the drawing is the untitled one moved down by the band, the atlas moves with it, a wide title widens the page, the default names); tests/system/semantic-boards/rasterize.test.ts (CLI routing in SVG and PNG, empty --title refused).

Board: Semantic renderer@TASK-467 adds Export frame (lib/svg/export-frame.ts) with View dispatcher -> Export frame, anchored on framedForExport, and says in Board answer that it names the default title. check --code: no finding added or cleared (17 before and with the proposal). Footprint against f1895f0fe (the commit before 11e90fcfa): View dispatcher, Board answer and Export frame named and changed. Changed but not named: Bun host (src/runtime/semantic-renderer) only gained the tests export-board.ts and export-title.test.ts; Renderer core (directory) changed inside only through planned-frame.ts, where pageFor and plannedTitle moved, which the board does not draw. Adopted at version 43.

Byte identity: a scratchpad script hashed every render of a copy of the dogfood vault through the render route (17 boards; every variant x the whole variant and each view x Track and Blocks x light and dark x comparison on and off, embedded faces): 6792 answers, 6140 SVGs and 652 NOTHING_TO_RENDER. One server ran bd8076b19, started before any edit; one ran the final code. The two sorted hash files are identical (cmp).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
semantic render and semantic rasterize take --title [text]: the given words, or without them the board, view, variant and, when drawn, the variant compared with, set above the picture in the card-title face, measured with the diagram faces and painted with the palette's tokens (light, dark, auto). The drawing moves down whole with its atlas and is never laid out again; the accessible name starts with the title. Proven by src/runtime/semantic-renderer/tests/export-title.test.ts (Track, Blocks, a sequence view) and tests/system/semantic-boards/rasterize.test.ts (SVG and PNG, empty title refused); looked at in light and dark. Default output byte-identical (6792 hashes). archboard-pr uses --title. Board: Semantic renderer adopted TASK-467 (Export frame). Gate passed on Bun 1.4.3. Commits 11e90fcfa, 71a58bb4d.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: TASK-467
title: An exported board picture can carry a title
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-12 00:35'
updated_date: '2026-10-12 00:46'
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
- [ ] #1 An option on `semantic render` and `semantic rasterize` draws a title above the picture; the text is given by the caller, or defaults to the board, view and variant names when asked for
- [ ] #2 The title is measured with the diagram fonts, follows the theme (light, dark and the theme-following choice), and never overlaps or shifts the board's drawing
- [ ] #3 Without the option, the output is byte-identical to today
- [ ] #4 A test owner covers the title in SVG and PNG; the `archboard-pr` skill uses it in place of the hand-written title line
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

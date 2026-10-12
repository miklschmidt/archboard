---
id: TASK-468
title: 'An exported board can carry its legend, or export the legend by itself'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-12 00:35'
updated_date: '2026-10-12 02:19'
labels: []
dependencies: []
priority: medium
ordinal: 813000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An exported picture does not explain its notation, so a reader of a pull request or a document sees card kinds, relationship kinds and comparison marks without a key, and authors write the key by hand. The page already draws a legend of what the picture contains; the export should be able to carry it, and to hand it over as a separate picture that can sit beside the board in either direction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An option on `semantic render` and `semantic rasterize` adds the legend to the exported picture; it lists only what that picture draws (node kinds, relationship kinds and marks), the same as the page legend
- [x] #2 A command or option exports the legend alone as SVG and PNG in a horizontal layout and in a vertical layout
- [x] #3 The legend follows the theme choices (light, dark and the theme-following one), is measured with the diagram fonts, and is identical in content to the page legend
- [x] #4 Without the options, the output is byte-identical to today; the `archboard-pr` skill uses the legend option in place of the hand-written key
- [x] #5 Test owners cover content, both orientations, both themes and the unchanged default
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move the page legend's content model out of src/ui/semantic-board-canvas/lib/appearance.ts and SemanticChanges.tsx into the renderer core (transformers/semantic-renderer/lib/picture-key.ts, exported from its index): the attributes a subject group carries, reading them from a painted picture without a DOM, the distinct node kinds and relationship kinds in drawing order, the two line marks the legend always keys, and the marked standings with their counts. The page imports it; there is one derivation.
2. lib/svg/export-frame.ts draws the legend from that model with the picture's own symbols: the standing pin, the type chip with its icon markup, the line with its dash, colour and arrowhead, the heavier line and the pulse. Labels measured with the diagram faces; colours are palette tokens, so light, dark and auto follow.
3. CLI on render and rasterize: --legend horizontal|vertical adds it (a band under the picture, wrapped at its width, or a column beside it); --legend-only draws the legend alone in that layout. Wire: legend=<layout>, picture=off.
4. Tests: renderer module owner for content (equals the page model read from the picture), both orientations, no overlap, auto theme; absent options give identical bytes; system rasterize owner covers SVG and PNG through the CLI.
5. archboard-pr renders.md/SKILL.md: the legend option replaces the hand-written key. ADR 0025's 'Exported diagrams have no legends for now' is amended.
Boards: Semantic renderer gains Picture key (proposal Semantic renderer@TASK-468).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions (smallest product): two options on both commands, --legend horizontal|vertical and --legend-only, rather than a separate command. --legend-only draws the key without the picture and needs --legend for its layout; the CLI refuses it otherwise (exit 2, nothing on stdout) and the route refuses legendOnly=on without legend. Horizontal wraps a row at the picture's width under it; vertical is a column beside it. The legend alone keeps the width a row would wrap at under the picture.

One content model: the page legend read the picture with DOMParser in src/ui/semantic-board-canvas/lib/appearance.ts. That derivation (pictureAppearances, keyOf, sampleKey, appearanceFrom) moved to src/transformers/semantic-renderer/picture-key.ts, a small root entrypoint of the renderer module that the page and the export both import (boundaries.md: a module may expose several small entrypoints; ui may import transformers). pictureAppearances is now a DOM-free tag scanner so it runs in the Bun host too; a test holds it to a happy-dom DOMParser query. The marks' order and counts (markCounts, from SemanticChanges) and the two line marks (LINE_MARKS, from SemanticLegend) moved there too. The page keeps only drawnAppearance (one subject, for its tip).

Drawing: lib/svg/legend.ts draws each entry with the picture's own symbol, made by the code that draws it on the picture: standingPinAt for a mark, chipTile (extracted from typeChip, byte-neutral) under the picture's icon markup for a kind, drawnInk with STROKE_WIDTH, DASH_ARRAY (extracted from edgeAttributes, byte-neutral) and the head for a relationship, the hero line, and a pulse gradient for traffic. Words in the card-note face at 12 px with muted counts. SVG document now always treats the near, far and away place properties as its own, so a document with no card (the legend alone) does not look for theme values it never had; a document with cards already set them.

Not keyed: the unsettled triangle, which the page legend does not list either; renders.md tells archboard-pr to say what it means under the render. ADR 0025 is amended: exported diagrams can carry the legend.

Tests: src/runtime/semantic-renderer/tests/export-legend.test.ts (content equals the page key for an architecture and a sequence view; no marks without the comparison or on the current variant; the scanner equals a DOM query; horizontal under and wrapped, vertical beside, on Track and Blocks, the drawing and atlas unchanged; the legend alone draws no subject and lists the same; auto declares both grounds); src/runtime/semantic-rasterizer/tests/theme-following.test.ts draws an auto picture with title and legend under both schemes; tests/system/semantic-boards/rasterize.test.ts routes --legend and --legend-only through both commands in SVG and PNG, and refuses --legend-only alone.

Looked at (headless Chromium, light and dark): Blocks with a horizontal legend under a title, Track with a vertical legend beside, a sequence view with a horizontal legend, the legend alone horizontal, and the legend alone vertical with a title. Marks, chips, icons, inks, dashes, heads and counts legible on both grounds, nothing overlapping. The traffic sample was faint at a 20-unit span, so it runs 40 units like the page sample.

Board: Semantic renderer@TASK-468 widens Export frame, adds Export legend (lib/svg/legend.ts) and Picture key (picture-key.ts) with Export frame -> Export legend (legendOf), Export legend -> Picture key (pictureAppearances), Export frame -> Picture key (markCounts), and the page as a caller: Board viewer (src/ui/semantic-board-canvas, drilling to Board viewer) -> Picture key (pictureAppearances), plus Board viewer -> View dispatcher for the marks and inks it already took from the index (cornerWarning), which the code check asked for once Board viewer was drawn. check --code: no finding added or cleared (17 and 17). Footprint against 71a58bb4d: View dispatcher, Export frame, Export legend and Picture key named and changed. Changed but not named: SVG document (the own place properties above, internal); Bun host (tests only); Board answer (passes legend and legendOnly through, its purpose unchanged); Renderer core (inside, appearance.ts and styles.ts gained chipTile and DASH_ARRAY, which the board does not draw). b0878c329 is large (39 files): the page's imports of the picture key, nothing a board draws. Adopted at version 48. dogfood check: no diagnostics. check --code behind: the commits put Archboard server routes, Board rasterizer, Board viewer and Command interface behind; their parts still say what the code does (no part names the theme choices or the page's legend reading), and the one finding there, ANCHOR_SYMBOL_MISSING drawRequest on Board rasterizer, predates this work.

Byte identity: a scratchpad script hashed every render of a copy of the dogfood vault through the render route (17 boards; every variant x the whole variant and each view x Track and Blocks x light and dark x comparison on and off, embedded faces): 6792 answers, 6140 SVGs and 652 NOTHING_TO_RENDER. One server ran bd8076b19, started before any edit; one ran the final code. The two sorted hash files are identical (cmp).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
semantic render and semantic rasterize take --legend horizontal|vertical (the key under the picture, wrapped at its width, or a column beside it) and --legend-only (the key alone; needs --legend, refused with exit 2 otherwise). The key lists what the page legend lists for the same picture, read by one DOM-free reader, src/transformers/semantic-renderer/picture-key.ts, that the page now imports: comparison marks with counts, node kinds, relationship kinds and the two line marks, each drawn with the picture's own symbol. Proven by src/runtime/semantic-renderer/tests/export-legend.test.ts (content equals the page key, placement on Track and Blocks, legend alone), theme-following.test.ts (auto with legend under both schemes in Chromium) and tests/system/semantic-boards/rasterize.test.ts; the legend alone was also rasterized to PNG in both layouts through the CLI and looked at. Default output byte-identical (6792 hashes). ADR 0025 amended; archboard-pr uses --legend horizontal. Board: Semantic renderer adopted TASK-468 (Export legend, Picture key, Board viewer caller). Gate passed on Bun 1.4.3. Commits b0878c329 and the vault adoption.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: TASK-468
title: 'An exported board can carry its legend, or export the legend by itself'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-12 00:35'
updated_date: '2026-10-12 00:46'
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
- [ ] #1 An option on `semantic render` and `semantic rasterize` adds the legend to the exported picture; it lists only what that picture draws (node kinds, relationship kinds and marks), the same as the page legend
- [ ] #2 A command or option exports the legend alone as SVG and PNG in a horizontal layout and in a vertical layout
- [ ] #3 The legend follows the theme choices (light, dark and the theme-following one), is measured with the diagram fonts, and is identical in content to the page legend
- [ ] #4 Without the options, the output is byte-identical to today; the `archboard-pr` skill uses the legend option in place of the hand-written key
- [ ] #5 Test owners cover content, both orientations, both themes and the unchanged default
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

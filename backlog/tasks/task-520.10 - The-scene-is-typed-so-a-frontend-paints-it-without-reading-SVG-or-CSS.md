---
id: TASK-520.10
title: The scene is typed, so a frontend paints it without reading SVG or CSS
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T04:29:00Z'
updated_date: '2026-10-25T07:43:00Z'
labels: []
dependencies:
  - TASK-520.09
parent_task_id: TASK-520
ordinal: 931000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0057 says each frontend paints the core's scene itself. Today the scene leaks SVG (review of 2026-10-25): an Element carries an SVG element name and an ordered list of SVG attributes, Item::Break only reproduces old newlines, paints are CSS expressions (var(--…), light-dark, color-mix), transforms and path data are SVG strings, groups carry both a role and its CSS class, and the painter mints ids by hashing serialized markup (paint/ports.rs, paint/crossings.rs), which keeps the SVG writer inside archboard-scene. A GPUI frontend would have to parse SVG and CSS. Make the scene a typed description of shapes, paths, paints, transforms, text runs and groups, and move every SVG and CSS spelling into archboard-svg.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The scene's types hold no SVG element name, attribute string, path-data string or CSS expression; paints name palette tokens and colour operations as values
- [ ] #2 Ids are minted from scene values, not from serialized markup, and the SVG writer lives only in archboard-svg
- [ ] #3 archboard-svg writes every corpus picture as the same bytes as before the change
- [ ] #4 A native Rust test reads the shapes, paints and text of a corpus board's scene without parsing any string
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Baselines before any change: full corpus (bun scripts/render-corpus.ts render /tmp/scene-before --variants all --jobs 4: 36032 drawings of 51616 jobs), an export corpus (every board's current variant, every view, both engines, comparison on and off, no legend, horizontal, vertical, each alone, no title, the names, own words; themes and fonts cycled: 17640 exports), and a sampled byte-level oracle with every SVG written (2803 drawings including exports).
2. Catalogue every element, attribute order, style order, class, transform, path spelling and data attribute the painters emit, from the written SVGs and the emission sites.
3. Scene as typed values (crates/archboard-scene/src/scene/): items (group, shape, text, icon, viewport, definitions, traffic); groups with subject, role (with the facts each role carries), transform, opacity, mask, pointer and members; shapes with a purpose, a geometry (rect, circle, line, path commands) and typed fill and stroke; colours as palette tokens and colour operations (mix, light-dark, tone, held tone); definitions (markers, gradients, masks, clips) with ids made of scene values.
4. Painter rewritten onto the typed scene; every SVG and CSS spelling (element names, attribute order, paint as style, path and transform spelling, classes, data attributes, colour CSS, ids by content hash, line breaks) moves to crates/archboard-svg.
5. Review findings settled (pulse constants, far-view classes, public modules, as_str via serde, arrowhead constants, Shapes trait, type_chip, placed_on, export-types order, paintScene, flows.rs duplicates, marks.ts copies).
6. Native test of AC4 on a corpus board; design written into ADR 0057 or a linked note.
7. Corpus and export compared byte for byte; gate lanes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Evidence (2026-10-25)

Commits: f2d1769b5 (typed scene, archboard-svg writer, wasm, flows), 21b0b5d12 (generated viewer marks and their TS readers), 791b96fdb (native AC4 test), 1ea3078c6 (ADR 0057 and docs/design/typed-scene.md).

- AC1: scene types live in crates/archboard-scene/src/scene/ (colour, shape, definition, text, group, traffic). Colour is a Token/Palette/Mix/LightDark/Tone/Held value. Paint is None/Colour/Gradient(id). Geometry is Rect/Circle/Line/Path(Vec<PathStep>). No element name, attribute string, path-data string or CSS expression remains in a scene type.
- AC2: MarkerId, GradientId, MaskId and ClipId are values minted by the painter. The SVG spelling of each id, and the content hash of a mask's and a clip's markup, are in crates/archboard-svg/src/definitions.rs. markup.rs left archboard-scene, and the writer is crates/archboard-svg/src/{xml,colour,path,shapes,groups,definitions,write,pulse}.rs.
- AC3: `bun scripts/render-corpus.ts render /tmp/scene-after --variants all --jobs 4` then compare against /tmp/scene-before: "0 of 36032 drawings differ". Export corpus (every board's current variant, every view, both engines, comparison on and off, the legend and title options, themes and fonts cycled): "0 of 17640 exports differ". Both ran after the last source change.
- AC4: crates/archboard-scene/tests/typed_scene.rs, with the fixture tests/fixtures/codex-session.paint.json (the dogfood board "Codex session", captured as the renderer hands it to the core). each_card_is_a_typed_plate_at_its_box_saying_its_words and each_line_is_a_path_stroked_with_a_colour_and_its_head_is_defined pass under `cargo test --locked --workspace`.

Decisions on the review findings:
- Pulse lengths and pulse_breadth live once in scene/traffic.rs, and `within` is js::within.
- The far-view classes and HALO_CLASS are consts in archboard-svg (groups.rs, shapes.rs).
- The paint modules are private except `design`. archboard-svg reads scene::FACES and Token, not paint internals.
- names::word reads the serde rename, which replaces the seven as_str functions.
- The legend's arrowheads reuse edge_line::arrowhead and OPEN_ARM. The Compact path spelling keeps the bytes.
- The Shapes trait is gone, type_chip draws at the origin, and placed_on runs once.
- export-types collects its declarations in a BTreeMap and prints them sorted.
- The unused wasm paintScene is removed. flows.rs uses scene.rs's request_of and names::word for the family.
- marks.ts copies: the core generates them (paint::viewer_marks, archboard-svg's export-marks bin, written by build-core.ts to the ignored generated/core/marks.ts). picture-key.ts still reads the key from the SVG: returning the key with the document needs a change to the render reply and the apps/web DOM reading, which is outside this task's write scope.

Unsettled: Edge.path in the drawing contract and geometry::path_of stay, because archboard-flows still uses them. Item::Break stays as the SVG document's line breaks, which other painters skip.
<!-- SECTION:NOTES:END -->

---
id: TASK-520.10
title: The scene is typed, so a frontend paints it without reading SVG or CSS
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T04:29:00Z'
updated_date: '2026-10-25T11:47:00Z'
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
- [x] #1 The scene's types hold no SVG element name, attribute string, path-data string or CSS expression; paints name palette tokens and colour operations as values
- [x] #2 Ids are minted from scene values, not from serialized markup, and the SVG writer lives only in archboard-svg
- [x] #3 archboard-svg writes every corpus picture as the same bytes as before the change
- [x] #4 A native Rust test reads the shapes, paints and text of a corpus board's scene without parsing any string
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

## Board proposal (2026-10-25)

Semantic renderer@TASK-520.10 (variant t7DPgM6B) adopted at version 110; the board was at version 106 when it branched from TASK-520.04 (GJtbsPFm). Current summary: "Meaning to a typed scene, its SVG and interaction geometry".

Changes, each checked against the code:
- SVG document (eECDrhMc): kind module, bound to crates/archboard-svg/src. It is the one place that spells a scene as SVG and CSS (xml.rs, colour.rs, path.rs, shapes.rs, groups.rs, definitions.rs, write.rs, pulse.rs). Its export-marks program (src/bin/export-marks.rs) prints the viewer marks, and scripts/build-core.ts:93-103 writes them to generated/core/marks.ts.
- Scene (GTiZqw4F): bound to crates/archboard-scene/src/scene (its old binding, scene.rs, was deleted by f2d1769b5). The description now lists the typed groups, shapes, colours, text, icons, viewports, definitions and traffic (scene/mod.rs).
- Theme palette (u1OXg3Yy): every colour is a token or an operation on tokens, not a CSS expression (paint/palette.rs:1-2).
- Renderer core (OEslPPbt): paintDocument paints a typed scene and answers the document that archboard-svg writes of it (archboard-renderer-wasm/src/scene.rs:57-82). paintScene is gone. build:core writes the contract types (the paint request, the scene, the painted document: export-types.rs:1-2) and the viewer marks.
- Viewer marks (FxzFUQAt): reads the constants the core generates (marks.ts:1-21).
- Painting (m6HOX0lf): the scene holds no SVG or CSS.
- Edges: Scene -> SVG document (2RYupgix) is anchored at archboard-svg lib.rs `Scene` and is now "the typed scene, written as one document". Architecture painter -> Scene (qDiEFiIT, anchor `Item`) and Sequence painter -> Scene (QDc3ch8T, anchor `Group`) now say "groups, shapes, text and traffic". New: SVG document -> Viewer marks (8sb931X2), "the marks' inks, widths and heads, generated at build time", anchored at export-marks.rs `viewer_marks`.
- Re-anchored, because their symbols were gone from files that f2d1769b5 rewrote: XVvCNvvX at sequence.rs `standing_pin_at`, HDZqKmN4 at sequence.rs `ghost_face`, OVkwk7CO at slab.rs `ink_of`.

Corrected from the implementer's proposal:
- No new "archboard-svg" part. The existing SVG document part was already archboard-svg (bound to crates/archboard-svg/src/lib.rs), so a second part would draw the same crate twice. I rebound it to the crate and described what it owns.
- "The scene painter -> archboard-svg" is the existing Scene -> SVG document relationship, now anchored. The core's call into the writer is still Renderer core -> SVG document (3AD13A3I, scene.rs `document`).
- "The core part answers typed scene values" is not what the code does. No wasm export answers a scene: paintScene is gone, and paintDocument answers the SVG document with its size, atlas and what it placed. The core part now says that it paints a typed scene and answers the written document.

Code check (`archboard check --code`, compared with and without `--variant TASK-520.10`): no `>` lines. Five `<` lines: the ANCHOR_SYMBOL_MISSING findings of qDiEFiIT (Role), QDc3ch8T (TrafficMark), XVvCNvvX (standing_pin), HDZqKmN4 (slab_seat) and OVkwk7CO (standing_ink). The board check's BINDING_PATH_MISSING on Scene (crates/archboard-scene/src/scene.rs) cleared on adoption.
These findings on this board are in both runs and I left them: 0s8raCUw (label_anchor_of), ryvCaAp5 (standing_pin_at in export.rs; the call is in legend_symbols.rs), t5CUCz5T (paint_heading_views), uGaKoVb8 (coreBuild), steps o1aDteuC (step_path, now in sequence_messages.rs) and 7ZIx3pOn (picture_appearances, now in legend_entries.rs). They predate this task: none of these symbols was in its file at cfdc1d607 either. They come from the port of TASK-520.03.

Footprint read against base cfdc1d607, the parent of f2d1769b5, found with the trailer command. current = TASK-520.04, the proposal's parent.
- namedAndChanged: Theme palette, Architecture painter, SVG document, Sequence painter, Renderer core, Scene, Viewer marks.
- namedNotChanged: none.
- changedNotNamed, changed by f2d1769b5: Subject atlas, Sequence layout, Slab surfaces, Tray surfaces, Card ports, Near and far content, Measured card painter, Export frame, Export legend, Flowchart, Subject standing marks. Each now builds typed scene values (shapes, paints, ids from values) instead of markup. What each part does and what it calls stay as drawn, so the board is still right. f2d1769b5 is marked large (69 files), and it is this task's own refactor, not a sweep.
- Renderer host, Engine pool, Bun layout worker and Browser layout worker were changed only by cd997ea97 (TASK-520.05) and belong to that task's closing.

archboard check: no diagnostics on Semantic renderer. The four BINDING_PATH_MISSING warnings left are on Renderer layout, for parts that TASK-520.05 removed.
Behind (check --code), the boards this task's commits put behind:
- Board viewer: "Render stage states" through 21b0b5d12. SemanticTypeSamples.tsx and SemanticSubjectTip.tsx now read the generated marks through the renderer. The part's responsibility and relationships are unchanged, and the Semantic renderer edges into Viewer marks (N8eFnJ9p, bwa7JRYk) still hold.
- Renderer layout: Architecture painter through f2d1769b5. It changed inside only, and the part still "paints the settled drawing into a scene and decides no geometry".
- Archboard: the renderer package. That container is still right.

Pictures (dark, 2026-10-25): Semantic renderer@TASK-520.10 against TASK-520.04. The overview shows Painting and Renderer core changed and the added edge Painting -> Key and export (the generated viewer marks). The Painting view shows SVG document, now a module, and Theme palette changed. Labels and cards read cleanly, with nothing clipped.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The scene is typed: crates/archboard-scene/src/scene holds groups with typed roles and subjects, shapes with typed geometry (rects, circles, lines, paths as steps), fills and strokes, colours as theme tokens, palette colours or colour operations, definitions, text and traffic. Ids are minted as values in the painter; every SVG and CSS spelling (element names, attribute order, path spelling, colours, classes, stylesheet, data attributes, font faces, SMIL pulses, ids) lives in crates/archboard-svg, which writes every picture to the same bytes: 0 of 36,032 corpus drawings and 0 of 17,640 exports differ. crates/archboard-scene/tests/typed_scene.rs reads a corpus board's scene as typed values without parsing a string. The core generates the viewer-mark constants that marks.ts reads; the type exporter prints in a stable order; the unused paintScene export is gone. docs/design/typed-scene.md and ADR 0057 describe it; Semantic renderer@TASK-520.10 is adopted (v110). Open: the picture key is still read back from the SVG (TASK-520.08 moves the render reply into the core), and Item::Break keeps the document's line breaks.
<!-- SECTION:FINAL_SUMMARY:END -->

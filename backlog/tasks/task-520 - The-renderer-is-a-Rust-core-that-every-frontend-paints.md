---
id: TASK-520
title: The renderer is a Rust core that every frontend paints
status: In Progress
assignee:
  - '@claude'
created_date: 2026-10-24 12:53
updated_date: '2026-10-25T20:07:00Z'
labels:
  - renderer
  - performance
dependencies: []
documentation:
  - >-
    docs/adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
priority: high
ordinal: 920000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A native desktop frontend (GPUI with Vello, later) cannot draw today's pictures: the SVG the renderer writes is a live browser document that SMIL, CSS transitions and the viewer's classes animate, so only a browser draws it faithfully. libavoid, which routes the trunks of Blocks, is the largest single cost of a render (TASK-512, docs/design/layout-rules.md). Text is measured by the canvas of the place that draws, so a picture depends on which fonts load where it is shown. ADR 0057 records the decision: the renderer becomes a Rust crate compiled to WASM for Bun and the browser and linked natively by a native frontend, its output is a scene that each frontend paints, it routes with its own router and it shapes text into glyph runs. The elk-rs port (layout-rules.md section 23) is the precedent for porting with an oracle. GPUI experiments come after this task and are not part of it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Bun and the browser render every board through the same WASM build of the Rust core, and no TypeScript layout or painting rules remain in packages/renderer
- [ ] #2 Each port step leaves every corpus picture the same bytes, except the router and text steps, whose pictures are no worse on the measures of ADR 0039
- [ ] #3 A native Rust program links the core and gets the scene of a board without a JavaScript engine
- [ ] #4 The development tools come from the Nix flake of the repository
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-25, Rust code-check findings settled on the boards (with the merged Rust adapter at 8a38b9288 and rust-analyzer configured for this checkout). `check --code` went from 84 findings (28 ANCHOR_MISMATCH, 8 ANCHOR_SYMBOL_MISSING, 25 RELATIONSHIP_UNDRAWN, 1 CALLER_UNDRAWN, 22 EXPOSED_UNUSED) to 43 (0, 4, 16, 1, 22). `archboard check` is clean.

Semantic renderer@TASK-520 code check (adopted at version 128; then Browser core loader taken out of Browser application in place at 129, because a line from a container to its own part is refused):
- New part Picture painter (paint/mod.rs#paint), the painter's one public call. View dispatcher calls it; it calls Architecture painter, Sequence painter and Export frame (same relationship ids, new `from`), takes the palette from Theme palette (Palette::of_page) and the standings from Subject standing marks. The three flows go through it. This clears the 8 `paint` anchors.
- New part Key entries (legend_entries.rs): Picture key, Export legend and Export frame call it; the export flow's two self steps became calls to it.
- New part Browser core loader (ui/clients/core.ts, from a0047b5cb): Browser application and Browser layout worker load the core through it (was initCore, ANCHOR_SYMBOL_MISSING).
- Picture key binds key.rs whole, and calls SVG document (write_icon).
- Re-anchored: picture as flowchart.picture and sequence.picture; slab_shadow, shadow_under; colour (export-marks); standing_pin_at in legend_symbols.rs; draw for the settled drawing; paint_heading_views; Item in write.rs; SemanticLegend; paint_flow and framed_for_export for self steps.
- Removed Edge geometry -> Architecture painter: the curves reach the painter in the settled drawing, not from geometry.rs.
- Drawn: Sequence layout -> Layout engines (Node), Flowchart -> Edge geometry, Near and far content -> Measured text and -> Subject standing marks, Scene -> Measured text, Subject standing marks -> Theme palette, Architecture painter -> Near and far content.

Renderer layout@TASK-520 code check (adopted at version 84): View dispatcher -> Board layout (dependency, MeasuredGroups and LineLook, the layout's input types); the painter's relationship and step anchor lib.rs#drawn; the self steps anchor draw and placed_blocks.

Footprint against the merge base with main: current was the parent (TASK-520.08) on both. The changedNotNamed parts are TASK-520 changes that its adopted variants already draw; this proposal corrects only what the code check reads.

Left on purpose:
- Scene RELATIONSHIP_UNDRAWN: every painter helper builds scene values; the board keeps Scene as the product of the two grammar painters, and eleven lines from helpers would say nothing new.
- Crossing pass CALLER_UNDRAWN: the flowchart is the layout's second caller, drawn on Semantic renderer (Flowchart -> Layout engines); Renderer layout follows the architecture render.
- Board layout EXPOSED_UNUSED: archboard-layout's lib.rs re-exports InProcess (used only by tests) and Laying, and nothing outside the crate uses either. A code matter, not a board one.

Pre-push review (2026-10-25): twelve Codex gpt-6-astra reviewers at xhigh, eight scopes (router and text, Blocks, Track, layout core, scene and SVG, flows and render, TypeScript host, tooling) and four boundaries (WASM host contract, scene to painters, crate interfaces, core build and staleness), then a second round for the SVG path left in the scene and for WASM panics. Their fixes are merged with every drawing byte-equal: among them exponential container bounds in Track, quadratic route separation and long-word wrapping, paired solves that hid an error, renders left pending by a host that throws or by a Rust panic (one CoreGuard in the generated glue now rejects them with CORE_PANIC and refuses reuse), the browser refusing a stale core, CI building the core for macOS, and the scene no longer spelling SVG paths. Two Track faults that the TASK-520.08 adoption exposed (a cycle closed through a frame, a gutter between containers) are fixed and recorded as layout-rules section 56; 8 of 2,344 current drawings changed, both views better on the ADR 0039 measures except that Renderer layout's Responsibilities page grew. Full gate on the merged branch: exit 0 in every lane.
<!-- SECTION:NOTES:END -->

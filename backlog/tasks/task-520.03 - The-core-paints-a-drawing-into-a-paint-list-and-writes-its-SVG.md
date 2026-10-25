---
id: TASK-520.03
title: The core paints a drawing into a scene and writes its SVG
status: Done
assignee:
  - '@claude'
created_date: 2026-10-24 12:53
updated_date: '2026-10-25T06:05:00Z'
labels:
  - renderer
dependencies:
  - TASK-520.01
documentation:
  - >-
    docs/adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
parent_task_id: TASK-520
priority: high
ordinal: 923000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The port starts at the output, so a native frontend can read a scene from the server while layout is still TypeScript. The drawing geometry that layout answers (shared/rules/render/drawing.ts and the sequence and flowchart drawings) becomes the input contract of the core. The SVG bytes that the TypeScript painter writes today are the oracle. The corpus is every board whole, every view and every non-current variant of the dogfood vault and the vaults under examples/, under both engines and both themes, with and without the comparison.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The core turns the drawing of an architecture, a sequence and a flowchart into a scene, and writes SVG from the scene
- [x] #2 Every corpus picture is the same bytes as the picture that the TypeScript painter wrote before the change
- [x] #3 Each group of the scene names the subject it draws and its role, and traffic is data on the scene, not SMIL
- [x] #4 The TypeScript types of the scene are generated from its Rust types
- [x] #5 The TypeScript painter under shared/rules/svg is gone, and the browser lane passes unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Record the corpus baseline (full, all variants) and a current-variant SVG baseline before any change.
2. crates/archboard-scene: the drawing contract (geometry, curves, fonts, text runs, the architecture drawing generic over node and edge facts, the sequence drawing, the paint request), the scene (groups with subject and role, elements, text, traffic marks as data), ECMAScript number formatting (ryu-js, exact toFixed, Math.round, JSC hypot), and the painter (drawing -> scene) ported from shared/rules/svg. Text is measured through a host Measure trait (the canvas of the place that draws, until TASK-520.07).
3. crates/archboard-svg: the SVG writer (scene -> document): stylesheet, markers and shared definitions, standalone theme tokens, traffic written as SMIL.
4. Generated TypeScript: a ts-rs exporter writes the contract and scene types into the ignored core build directory; build-core runs it; drawing.ts, geometry.ts, curves.ts and fonts.ts re-export them.
5. crates/archboard-renderer-wasm/src/scene.rs: paint (request + measure callback -> SVG and atlas) and paintScene.
6. TS hand-off: render/diagram.ts and flowchart.ts lay out as before and hand the drawing to the core; Bun loads the core before the first paint (refusing a stale build), the browser tab initializes the glue in startBrowserRenderer.
7. A differential harness renders every corpus job through both painters until they agree; then compare against the recorded baseline (0 differing drawings, --variants all).
8. Delete shared/rules/svg and what only served it; keep the picture key, inks, drill direction and code-finding marks apps/web reads; port the painter's unit tests to Rust.
9. Board proposal on Semantic renderer (Painting module), docs, gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Evidence (implementer, 2026-10-24)

Commits: 162f6dba3 (painter ported to Rust), b54e0b767 (every picture painted by the core, TS painter removed), 97fb8da5c (board proposals adopted), 2ab2c3b0c (a code-intel test that read the deleted primitives.ts now states its fixture inline).

- AC1 (the core turns architecture, sequence and flowchart drawings into a scene and writes SVG): `crates/archboard-scene/src/paint/mod.rs` `paint` handles `Picture::Architecture` (with flowchart shapes) and `Picture::Sequence`. `crates/archboard-svg/src/lib.rs` `document` writes the SVG. `crates/archboard-renderer-wasm/src/scene.rs` exposes `paintDocument` and `paintScene`. Every renderer test and every corpus drawing is painted through this path: `render/paint.ts` `paintDocument` is the only painter left.
- AC2 (every corpus picture byte-identical): `bun scripts/render-corpus.ts compare /tmp/t52003/before-all /tmp/t52003/after-all2` reports "0 of 35128 drawings differ" with `--variants all` (50,712 jobs) on the final code (b54e0b767). The baseline was rendered before the port started. Two numeric fixes made it exact: serde_json `float_roundtrip`, and `js::hypot` ports glibc's hypot, which Bun's Math.hypot calls (test `measures_hypotenuses_as_bun_does`).
- AC3 (groups name subject and role, and traffic is data, not SMIL): `crates/archboard-scene/src/paint/mod.rs` test `each_group_names_its_subject_and_role_and_traffic_is_data`. The SVG writer turns traffic data into SMIL only in `crates/archboard-svg/src/pulse.rs`.
- AC4 (TS scene types generated from Rust): `crates/archboard-scene/src/bin/export-types.rs` (ts-rs) runs in `scripts/build-core.ts` and writes the ignored `packages/renderer/src/shared/protocol/generated/core/types.ts`. `render/drawing.ts`, `geometry.ts`, `layout/routes/curves.ts`, `text/fonts.ts` and `protocol/render-request.ts` alias those types and hand-write none. The type-check lane compiles against them.
- AC5 (TS painter gone, browser lane passes unchanged): b54e0b767 deletes `packages/renderer/src/shared/rules/svg/**` and `render/atlas.ts`. No browser test changed. The serial browser lane passes: 19 of 19 files, exit 0.

Timing (summed per-drawing time, full corpus): blocks 4,730,654 ms before, 2,280,952 ms after. Track 3,926,702 ms before, 1,682,304 ms after. Wall time with `--jobs 8`: 1,105 s before, 515 s after.

Decisions and deviations:
- The marks a pane draws itself stay in TypeScript in `render/marks.ts`. They are the key's line samples, the pins, the code warnings, and a line's ink, width and head. apps/web draws them synchronously without the core. `packages/renderer/tests/runtime/operations/marks/viewer-marks.test.ts` holds them to what the core draws.
- TypeScript still computes the sequence values that the layout owns, in `render/sequence-picture.ts`, and passes them in the drawing. They are travel, ends, label and step boxes, pitch and title room. Moving them belongs with the layout port.
- A few layout files changed only for moved imports and removed dead code (`layout/sequence/sequence-design.ts`, `sequence-card.ts`, `text/measurement.ts`, `flowchart/flowchart-ports.ts`).
- `loadCore` stays as an async wrapper over the synchronous `coreBuild`, because the layout workers (TASK-520.02 files) still call it.
- libm's trigonometry differs from glibc in the last bit for some inputs. The corpus shows no effect, but a future drawing can round differently by 0.01.
- ADR 0057 was not changed. It is correct as written.
- Boards: `Semantic renderer@TASK-520.03` and `Renderer layout@TASK-520.03` were drawn, checked, and adopted. `archboard check --code --variant TASK-520.03` added no finding against the run without the variant and cleared the findings on the deleted paths. The footprint was read against base `162f6dba3^`. changedNotNamed is empty on both boards. namedNotChanged is Sequence layout and Subject code marks, named only by relationships. Both commits are large (over 30 files). `archboard check` reports no diagnostics.

Gate: `bun run check` inside `nix develop` exits 0 on 2ab2c3b0c. test:modules 4874 pass, 1 skip, 0 fail. test:system 257 pass. test:repository 136 pass. test:serial-browser 19 of 19 files pass. The first run failed one test, `typescript-facts.test.ts`, because it read the deleted `svg/page/primitives.ts`. Commit 2ab2c3b0c fixes it.

Closing (2026-10-25): three independent reviews covered the scene crate (its contract and the SVG writer, the architecture painters, and the paint primitives with the sequence painter and export) and committed fixes with 0 of 2,344 drawings changed. AC3 holds as written (each group names its subject and role; traffic is data). The review found that the scene still carries SVG element names, attribute strings and CSS paints, which a native frontend would have to parse; that is TASK-520.10.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The renderer core paints every architecture, sequence and flowchart drawing into a scene and writes its SVG (crates/archboard-scene, crates/archboard-svg), and the TypeScript painter under shared/rules/svg is gone. Every corpus picture is the same bytes as the TypeScript painter wrote. Each group names its subject and role, and traffic is data on the scene. The TypeScript types of the drawing and the scene are generated from the Rust types with ts-rs. The browser lane passes unchanged. Reviewed on 2026-10-25 with fixes committed; the scene's remaining SVG and CSS vocabulary is TASK-520.10.
<!-- SECTION:FINAL_SUMMARY:END -->

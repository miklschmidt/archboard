---
id: TASK-520.06
title: The core lays out sequences and flowcharts
status: Done
assignee:
  - '@claude'
created_date: 2026-10-24 12:53
updated_date: '2026-10-26T13:13:00Z'
labels:
  - renderer
dependencies:
  - TASK-520.03
documentation:
  - >-
    docs/adr/0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
parent_task_id: TASK-520
ordinal: 926000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Layout moves to Rust one engine at a time, each against the drawing geometry that the TypeScript stage answers as the oracle. This task ports sequences and flowcharts (shared/rules/flowchart and the sequence layout). Text measurement and Graphviz stay capabilities that the host gives the core through imports until TASK-520.07 and a later decision (ADR 0057). The corpus is every board whole, every view and every non-current variant of the dogfood vault and the vaults under examples/, under both engines and both themes, with and without the comparison.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The core answers the drawing of every corpus board that sequences and flowcharts lays out, and the drawing is equal to what the TypeScript stage answered
- [x] #2 Every corpus picture is the same bytes as before the change
- [x] #3 The ported TypeScript rules are gone from packages/renderer
- [x] #4 No corpus board renders slower, measured with the same harness before and after
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Record the baseline corpus (all variants, both engines, both themes, comparison on and off) from a copy of the base commit, and a flows-only corpus with SVGs as the oracle for every sequence and flowchart drawing.
2. New crate crates/archboard-flows: the board's flows and nodes as read (board.rs), the host's text as a trait (text.rs: widths from the painter's Measure, note and message line breaks), the sequence layout (sequence/: design, card, rows, placing, activations, messages, frames, layout, and the drawing and shown reading in mod.rs), the flowchart (flowchart/: graph, ports, and the layout with the host's track engine as an async trait method), and the two route helpers copied from TypeScript (routes.rs: reversed, pair_crossings).
3. Binding crates/archboard-renderer-wasm/src/flows.rs: drawSequence (sync, one call lays out and paints) and drawFlowchart (async: awaits the host's track engine through wasm-bindgen-futures, then paints in the same call).
4. TypeScript: render/flows.ts hands the request to the core and answers the host's text and track calls; render/diagram.ts calls it; delete layout/sequence/**, flowchart/**, render/sequence-picture.ts and shownFlows.
5. Compare flows-only corpus byte for byte, then the full corpus (AC2); time current variants with --jobs 1 before and after (AC4).
6. Docs (layout-rules.md section 52, boundaries.md), gate, board changes listed for the parent.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Evidence (2026-10-25)

Commits: 73a1dbb77 (crate and binding), dc63a80dd (TypeScript calls the core, ported rules deleted), c18be0658 (docs), e9c4bc895 (the flows host passes the lint policy).

AC1, the core's drawing equals the TypeScript stage's: proven. The oracle was a flows-only corpus run from a copy of the base commit 2df6736f4. It drew every sequence and flowchart view of every variant, under both engines and both themes, with and without the comparison, and wrote each SVG. The same run on the port was compared file by file: 22216 SVGs compared (13,364 sequence, 8,852 flowchart), 0 differ, 0 only before, 0 only after. The oracle script stayed in /tmp and is not committed.

AC2, every corpus picture is the same bytes: proven. `bun scripts/render-corpus.ts render ... --variants all --engines track,blocks --themes light,dark --comparison on,off --jobs 8` ran before (base copy) and after, then `compare` answered "0 of 35560 drawings differ" (sequence 13,364, flowchart 8,852, architecture 13,344).

AC3, the ported TypeScript rules are gone: proven by commit dc63a80dd. It deletes packages/renderer/src/shared/rules/layout/sequence/** (8 files), shared/rules/flowchart/** (3 files), render/sequence-picture.ts, and shownFlows, shownColumn and touches of render/shown.ts.

AC4, no corpus board renders slower: NOT MET for flowcharts. The current variants ran with `--jobs 1`, four alternating runs before and four after, and each drawing counts at its fastest run.

- Sequence: 9,229 to 8,795 ms for 968 drawings. 11 are slower by 1 ms of rounding.
- Architecture: 12,062 to 12,101 ms for 680 drawings. This code is untouched, so the difference is noise.
- Flowchart: 20,338 to 20,933 ms for 696 drawings, about 0.85 ms more each. Slower by 1 ms: 303, by 2 ms: 138, by 3 ms: 19, by 4 ms: 2, by 5 ms: 1.

A warm in-process bench of the 356 current flowchart drawings agreed: 9,664 to 9,944 ms a round. Instrumented, the extra time is the JSON crossing to the host's track engine. A flowchart has two layouts, rarely three. For each one, the core writes the graph and its measurement as JSON and parses the drawing back. That is about 50 KB a call and about 0.2 ms of serde_json parse in WebAssembly. The TypeScript flowchart handed the engine its own objects. The core's own logic and its text calls cost what they did before: 195,128 width calls a round before and after, none of them repeated. If the core holds the track engine (TASK-520.04), the crossing ends. AC4 is not checked, and the parent decides.

## Decisions

- One crate, crates/archboard-flows, with sequence/ and flowchart/ modules. It depends on archboard-scene for the drawing types, Measure and the geometry helpers.
- Layout and paint are one call each. drawSequence is synchronous. drawFlowchart is asynchronous: it awaits the host's track engine through wasm-bindgen-futures, then paints. The wasm binding gained js-sys and wasm-bindgen-futures, and through them Cargo.lock gains tokio and the futures crates.
- Host capabilities are traits. text::Text extends the Measure of archboard-scene with note and message line breaks. flowchart::FlowchartHost adds measure_node, measure_label, far_size and an async track. The binding implements them over JS imports, and every value crosses as JSON.
- A flowchart's icons are now the icons of every policy node kind, a superset of the old set. The bytes are unchanged.
- Layout constants that archboard-scene keeps private are repeated in sequence/design.rs. FLOW_ICON is repeated beside icons.ts.

## Helpers copied into the crate

- reversed, from shared/rules/layout/routes/curves.ts, into crates/archboard-flows/src/routes.rs
- pairCrossings, from shared/rules/blocks/tree/joins.ts, into crates/archboard-flows/src/routes.rs
- fittedSize, from shared/rules/text/text.ts, into crates/archboard-flows/src/text.rs (fitted_size)
- the node-kind part of typeAppearance, from shared/rules/render/semantic-appearance.ts, into flowchart/mod.rs (node_appearances)
- every other curve helper is the one in archboard_scene::geometry

## Left for others

- A comment in shared/rules/track/routes/points.ts still names flowchart-ports.ts. That file is outside this task's write scope.
- No gate lane runs cargo test. Run by hand: archboard-flows 9, archboard-router 13 and archboard-scene 33 pass.
- The report to the parent lists the board changes on Semantic renderer and Renderer layout. This task does not touch .archboard/vault.

## Gate (2026-10-25)

`bun run check` ran under heavy machine load from other agents. Its lint, fmt:check, type-check and build:frontend lanes passed. The run was then stopped from outside, so the test lanes ran one at a time.

- test:modules: 4866 pass, 1 skip, 6 fail. All six are time bounds under load: 3 repo-registry and 1 git-async timeouts, and the 3 s first-layout bound of wide-boards.test.ts for Agent workbench and Board viewer (track). Run alone, repo-registry and the git clients pass. Board viewer (track) still exceeds 3 s at load 11, and the base copy exceeds it the same way: 4,913 ms before against 4,716 ms after, back to back.
- test:system: 257 pass, 0 fail.
- test:repository: 136 pass, 0 fail.
- test:serial-browser: exit 0.

After commit e9c4bc895, the current variants were drawn again: "0 of 2344 drawings differ" against the timed baseline.

AC4 waived by the user on 2026-10-25: the flowchart slowdown of about 0.85 ms per drawing (the JSON crossing to the TypeScript track engine) does not matter. It is expected to go away when TASK-520.04 brings the track engine into the core.

## Board proposal (2026-10-25)

`Semantic renderer@TASK-520.06` was branched from TASK-520.02 at version 98, drawn to the code as built (versions 100 and 101) and adopted at version 102. Summary: "Meaning to a scene, its SVG and interaction geometry".

- Parts. New "Flows hand-off" (cMXIpraW) bound to render/flows.ts. "Sequence layout" (wLF1X11D) is bound to crates/archboard-flows/src/sequence. "Flowchart" (0idmUHd2) is bound to crates/archboard-flows/src/flowchart/mod.rs, its responsibility now says it lays the flow out for the architecture painter, and it moved from "Render entry" to "Layout and measuring", beside Sequence layout, because the core calls it and it no longer paints. The descriptions of Renderer core, View dispatcher and Measured text name drawSequence and drawFlowchart and the hand-off.
- Relationships. Added: View dispatcher -> Flows hand-off (diagram.ts drawSequence), Flows hand-off -> Renderer core (flows.ts drawSequence), Flows hand-off -> Renderer host (flows.ts rendererHost; the code check asked for it). Kept ids with their caller moved: IvQqev1K and RSHH7EN4 are Renderer core -> Sequence layout / Flowchart (flows.rs draw_sequence, draw_flowchart); oCH6TGpi and 8WJV0Mer are Flows hand-off -> Measured text / Layout engines (flows.ts measureNoteLines, layoutEngine). Removed: MooLuYkK (one call relationship per pair, oCH6TGpi carries it), LJUm7E1m (the Rust flowchart uses archboard_scene::geometry, not curves.ts) and ignhH2bt (the core paints inside drawFlowchart). 98et92HX is relabelled "paint the settled drawing", because only the architecture reaches the paint hand-off now.
- Flows. "Draw a view" and "Draw a sequence" now run View dispatcher -> Flows hand-off -> Renderer core -> layout. The core's text and track calls return through the hand-off, and the core paints and writes the document. The comparison filter (HUgQSpyw) is a Sequence layout self step at sequence/mod.rs shown_flows. 1gPGcKRA stays: scene.rs still calls the sequence painter through paint_scene.
- Code check: `diff <(findings) <(findings --variant TASK-520.06)` adds no line. It clears 15 lines: 12 ANCHOR_PATH_MISSING and 3 ANCHOR_SYMBOL_MISSING on the deleted TypeScript files. Rust files are text-only for the check, so the Rust anchors were read by hand: flows.rs:183 and :192, flowchart/mod.rs:224, :328, :413 and :559, sequence/mod.rs:56 and :61, sequence/rows.rs:71.
- Footprint against base 2df6736f4 (the parent of 73a1dbb77, found with the trailer command), read before adoption, `current` TASK-520.02 = the proposal's parent. namedAndChanged: View dispatcher, Sequence layout, Measured text, Renderer host, Flowchart, Renderer core, Paint hand-off, Flows hand-off. changedNotNamed: none. namedNotChanged: Edge geometry (curves.ts), named only by the removed LJUm7E1m. That is normal. Skipped: drill-down Layout engines (engines.ts has no commit in the range), plus unbound containers.
- Renderer layout needs no proposal. Its current variant anchors diagram.ts (layoutEngine, layoutRemembered, measureArchitecture, renderArchitecture, entryPointsOf) and measurement.ts. Every one of them still holds, and the check reports no finding on that board. After adoption, `check --code` lists Renderer layout as behind by one commit: dc63a80dd, on Measured text, which exports measureNode for the flows hand-off. That board draws the architecture layout, not the flows, so it is still right. Archboard's renderer package part (packages/renderer) is still right too.
- `archboard check`: no diagnostics. After adoption, `check --code` adds no finding over the baseline. The two BINDING_PATH_MISSING warnings of the old current variant are gone.
- Not seen: `semantic rasterize` refused, because the server could not load the WebAssembly core (`import function ...__wbg_cb_unref... must be callable`). The core build is outside this work, and a corpus render is running from the checkout, so the pictures were not checked.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The core lays out sequences and flowcharts. The new crate crates/archboard-flows holds the ported sequence and flowchart rules. The wasm binding crates/archboard-renderer-wasm/src/flows.rs draws a sequence in one synchronous call and a flowchart in one async call that waits for the host's track engine, then paints. packages/renderer/src/shared/rules/render/flows.ts answers the core's text and track calls, and the TypeScript sequence and flowchart rules are gone. Verified: 0 of 22,216 flows drawings differ from the TypeScript stage; 0 of 35,560 corpus drawings differ across variants, engines, themes and comparison; after the rebase onto main, every Track, sequence and flowchart drawing of the current variants equals main's except on the two boards this branch changed. AC4 was waived by the user: a flowchart draws about 0.85 ms slower, from the JSON crossing to the TypeScript track engine, which TASK-520.04 removes. Semantic renderer@TASK-520.06 is adopted (version 102). Gate after the rebase: lint, format, types, build, test:system, test:repository and test:serial-browser pass; test:modules fails only the two 3 s Track first-layout bounds, which main fails the same way at this machine's load.
<!-- SECTION:FINAL_SUMMARY:END -->

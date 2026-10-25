---
id: TASK-520.06
title: The core lays out sequences and flowcharts
status: In Progress
assignee:
  - '@claude'
created_date: 2026-10-24 12:53
updated_date: '2026-10-25T02:09:00Z'
labels:
  - renderer
dependencies:
  - TASK-520.03
documentation:
  - >-
    docs/adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
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
- [ ] #4 No corpus board renders slower, measured with the same harness before and after
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
<!-- SECTION:NOTES:END -->

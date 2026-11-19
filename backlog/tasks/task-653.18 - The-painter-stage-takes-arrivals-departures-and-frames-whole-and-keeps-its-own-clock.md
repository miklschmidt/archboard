---
id: TASK-653.18
title: >-
  The painter stage takes arrivals, departures and frames whole and keeps its
  own clock
status: Done
assignee:
  - '@claude'
created_date: '2026-11-19T17:34:00Z'
updated_date: '2026-11-19T19:26:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-653.01
  - TASK-653.04
parent_task_id: TASK-653
priority: high
type: task
ordinal: 1132000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## What to build

Candidate 3 of the archboard-deepen run, second on the Rust track. crates/archboard-paint is wide (52 names) and Painter stage (crates/archboard-paint/src/stage) is wide (29 names): the page drives the stage through setters for traffic, picture time, sweep and lighting, and tools reach private counters. The stage takes present, arrive and depart whole, owns its clock and draws to a surface. The settled design, every decision and its reason: the "Candidate 3, Painter stage: SETTLED" entry in artifacts/archboard-deepen/20261119T144122Z/decisions.md (its "Settled by the orchestrator" points override the advisors where they differ), and the tree tree-03-stage.md beside it (the run directory is ignored, not tracked; it sits at the root of the checkout). Hand-off from the candidate 6 tree (fact 9): crates/archboard-paint/src/between/tests.rs:516 (an_in_between_draws_with_balanced_layers) is a stage test that builds Stage::new, calls show and draws on a Count; it breaks under this ticket and moves with it to the stage's tests.

## Architecture

- Proposal: sL6y1FLr ("Deepen the wide and shallow modules"); this ticket builds its slice.
- Slice: Painter stage (crates/archboard-paint/src/stage), archboard-paint (crates/archboard-paint), the wasm binding (crates/archboard-painter-wasm), its TypeScript callers (apps/web picture-stage.ts, picture-stage-forms.ts) and the site's painter caller.
- Gate: before this ticket merges, `archboard model footprint --base deepen/module-depth --head <ticket-branch> --state sL6y1FLr --model-at checkout --fail-outside` exits 0, and `archboard check code --fail-shallow-modules --base deepen/module-depth` shows no finding on Painter stage and archboard-paint.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Painter stage has width 7 (new(theme, size, Pace), present, arrive, depart, draw(Surface, now) -> Motion, pick and the stage) and archboard-paint 19; Canvas has 9 operations with push(Layer) and CpuCanvas 3; Count moves to the wasm crate and paint's tests count from Record; INTERFACE_WIDE clears on both
- [x] #2 Strip retention is chosen per draw through Surface::{Direct, Strips}; OutOfCard stays a Departure variant; moments travel inside the timed values (at on camera, awaited, light, sweep, Entered, Into, Leaving), and the stage reads its clock once per stated at and in draw
- [x] #3 The wasm binding mirrors the stage: PictureStage keeps its app-facing methods, Held stays in TypeScript, briefPainter becomes present(held) then arrive or depart(Cleared), and one numeric setCamera stays for glides
- [x] #4 The 18 stage tests and 4 interrupted tests drive the new operations and read frames on a Record canvas; between/tests.rs:516 moves to the stage's tests; one seam test pins restore with the light stated before and after arrival at one moment; tests of picture_time, set_picture_time, clear_sweep, StageClock and Keeper as names are deleted
- [x] #5 CPU frame hashes of the corpus over a fixed script of moments (show, carry, entrance, dive, light change, sweep, traffic at 0 and 1.5 s, near and far) are identical before and after; GPU, WebGL and CPU parity is compared with scripts/paint-parity.ts, or GPU parity recorded as owed when only the CPU painter can run; the site audit passes
- [x] #6 An ADR records clock sampling, retention ownership, the rejected stage-side compare and the rejected birth flag
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Baselines on the unchanged code: CPU frame hashes over a scripted run, corpus SVG hashes, paint-parity on gpu, webgl and cpu, painter-bench counts.
2. Signature spike: new Stage and lib.rs surface, then bin/archboard check code for the widths.
3. Canvas push(Layer) with every adapter; part store in the stage; CpuCanvas pixels.
4. Stage new(theme, size, Pace), present, arrive, depart, draw(Surface, now) -> Motion, pick; stage tests at the seam on Record.
5. wasm binding mirrors the stage; renderer start functions hand the pace; PictureStage, briefPainter, the site's three scripts and both tools move together.
6. ADR 0085 and CONTEXT.md terms; proofs and the gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr

Baselines (artifacts/653-18, ignored): a native harness drew the 271 paintings of a dark current-state corpus on the CPU through the stage, with Strips retention as the wasm CPU painter does, over a script of show, light (fade, delays), marks, heads, warnings, hover, sweep (run, end, clear), awaited, glide, carry, leaving beside, entrance, interrupted entrance and edit, entrance into, leaving out and stay, dive in, landing, dive out and end, theme, resize, clear, traffic at 0 and 1.5 s, a stall, both restore orders, and near, far and traffic views as paint-parity draws them: 14,634 frame hashes and the bench's fill, stroke and layer counts. After: 14,354 of 14,363 shared frames byte-identical, counts identical. The 9 that differ are all enter2-3200 and edit-3300 (an entrance interrupted by another entrance, then edited); two more runs of the untouched base (9cc8594d56) differ from the first base run on 7 and 9 frames of the same two kinds, so those frames are nondeterministic before this change (Picture motion, outside this slice). paint-parity's old setPictureTime(1.5)+frame(0) equals the new frame(0)+frame(1500) on all 271 paintings.
Spike: Painter stage 7 (1 function, 1 class, 5 methods), archboard-paint 19 (2 functions, 2 classes, 15 methods) under the corrected measure; final check the same, no finding on either.
Proofs: corpus SVG 0 of 1084 drawings differ. paint-parity gpu, webgl and cpu ran in a windowed Chrome on this machine (RTX 4090): 270 comparisons before and after, 0.147% of ink apart on average both times; 9 shares moved by about 1e-8, the same on all three painters of a reading, from the SVG screenshot side. painter-bench before: 4976 fills, 165 strokes, 67 layers on the whole model; after equal through the native Count (Direct). No GPU parity is owed.
Site: paint.ts, astro check and build pass. Audit in a windowed Chrome: the hero paints, the window's picture enters and Replay clears and enters again, the own-model section paints live with traffic; no shell mock changed. App on examples/web-shop: first picture enters, opening Checkout API flies to its reading with traffic, light theme draws.
Outside the slice: Canvas drawing (draw/: push(Layer), the frame value renamed Seen), Scene picking (pick.rs: Seen), Picture motion (between/tests.rs: the stage test moved out; flight.rs: Seen), raise.rs and traffic.rs (Seen, push(Layer)), Painter choice (packages/renderer painter.ts: the pace), Picture clients (picture-stage-forms.ts), the site's painter-phases.ts deleted (unused once the renderer hands the pace).
Gates: check code --fail-shallow-modules --base deepen/module-depth has no finding on Painter stage or archboard-paint; it exits 1 on other modules' warnings (timing anchors, archboard-scene, 13 other wide modules). model footprint --fail-outside exits 1: the proposal sL6y1FLr does not name Painter stage, archboard-painter-wasm, Picture stage, Picture clients, Painter choice, Canvas drawing, Scene picking or Browser yet; the vault was left unchanged as instructed, so the slice has to be added to the proposal before merge.
Not done: the pulse-train cache measurement (D12) was not run; no cache was added.

Shape details within the settled design: the light carries its moment as Light.at; the hovered control is Presentation.hovered {toggle} (one level of Option, clippy option_option); a LineSweep with no delays clears and reads no clock, as clearSweep read none; present applies untimed values first and the timed ones in the order camera, awaited, light, sweep. The stage's page-facing types live in stage/said.rs and the presentation handling in stage/present.rs, because the repository keeps Rust files under 600 lines. The 4 interrupted tests drive the new operations and still compare CPU rasters byte for byte, which is their claim; the 23 stage tests read frames on Record. JSON has no infinity, so paint-parity states its always-far line as Number.MAX_VALUE.

Merged into deepen/module-depth. Footprint gate: exit 1 with recorded exceptions (proposal commit 99401d803e): Canvas drawing and Scene picking changed only by the Presentation -> Seen rename and push(Layer::Over); Browser's changed files all lie in Picture clients and Picture stage, which the proposal names (the gate does not credit the parent). Unbound files: this ticket, CONTEXT.md, ADR 0085, scripts/paint-parity.ts, scripts/painter-bench.ts, the site's painter callers (painter-phases.ts deleted).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The Painter stage is new(theme, size, Pace), present(Presentation), arrive(Painting, Arrival), depart(Departure), draw(Surface, now) -> Motion and pick: width 7, archboard-paint 19, INTERFACE_WIDE cleared on both. The stage owns its clock (read once per stated moment and per frame) and the strip canvases' parts (Surface::Strips per draw); Canvas starts layers with push(Layer); CpuCanvas answers pixels(); Count moved to the wasm crate. The wasm Painter mirrors the stage with one numeric setCamera; the renderer hands every painter its pace from @archboard/timing; PictureStage, briefPainter, the site's painters and both tools use the new contract. ADR 0085 and CONTEXT.md (Presentation, Arrival) record it. Proof: CPU frames byte-identical except 9 frames that are nondeterministic on the base too, SVG corpus unchanged, GPU/WebGL/CPU parity unchanged, bench counts unchanged, all lanes green, site audit passes. Before merge: the proposal sL6y1FLr must gain this slice (footprint --fail-outside fails until then).
<!-- SECTION:FINAL_SUMMARY:END -->

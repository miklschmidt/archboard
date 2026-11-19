---
id: TASK-653.18
title: >-
  The painter stage takes arrivals, departures and frames whole and keeps its
  own clock
status: To Do
assignee: []
created_date: '2026-11-19T17:34:00Z'
updated_date: '2026-11-19T17:34:00Z'
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
- [ ] #1 Painter stage has width 7 (new(theme, size, Pace), present, arrive, depart, draw(Surface, now) -> Motion, pick and the stage) and archboard-paint 19; Canvas has 9 operations with push(Layer) and CpuCanvas 3; Count moves to the wasm crate and paint's tests count from Record; INTERFACE_WIDE clears on both
- [ ] #2 Strip retention is chosen per draw through Surface::{Direct, Strips}; OutOfCard stays a Departure variant; moments travel inside the timed values (at on camera, awaited, light, sweep, Entered, Into, Leaving), and the stage reads its clock once per stated at and in draw
- [ ] #3 The wasm binding mirrors the stage: PictureStage keeps its app-facing methods, Held stays in TypeScript, briefPainter becomes present(held) then arrive or depart(Cleared), and one numeric setCamera stays for glides
- [ ] #4 The 18 stage tests and 4 interrupted tests drive the new operations and read frames on a Record canvas; between/tests.rs:516 moves to the stage's tests; one seam test pins restore with the light stated before and after arrival at one moment; tests of picture_time, set_picture_time, clear_sweep, StageClock and Keeper as names are deleted
- [ ] #5 CPU frame hashes of the corpus over a fixed script of moments (show, carry, entrance, dive, light change, sweep, traffic at 0 and 1.5 s, near and far) are identical before and after; GPU, WebGL and CPU parity is compared with scripts/paint-parity.ts, or GPU parity recorded as owed when only the CPU painter can run; the site audit passes
- [ ] #6 An ADR records clock sampling, retention ownership, the rejected stage-side compare and the rejected birth flag
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Proposal: sL6y1FLr
<!-- SECTION:NOTES:END -->

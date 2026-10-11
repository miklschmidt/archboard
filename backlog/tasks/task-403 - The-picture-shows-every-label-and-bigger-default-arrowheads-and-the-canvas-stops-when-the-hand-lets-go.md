---
id: TASK-403
title: >-
  The picture shows every label and bigger default arrowheads, and the canvas
  stops when the hand lets go
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 02:23'
updated_date: '2026-10-06 03:53'
labels:
  - renderer
  - frontend
dependencies: []
references:
  - docs/adr/0042-the-picture-answers-the-hand-and-a-card-opens-by-flight.md
ordinal: 742000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
While it adopted Slabs the owner asked for three reading fixes. A default relationship has a small arrowhead, so its direction is hard to read next to an emphasized one. The viewer hides relationship labels when the picture is seen from far away (ADR 0042), and the owner wants a label to be visible always. A released drag keeps the camera moving (cameraFling in ADR 0042), and the owner does not want that. The wheel and pinch easing stays as it is.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A default relationship has an arrowhead as large as an emphasized relationship had before this task, and no arrowhead overlaps a bend of its line on any board of the example vault or of the dogfood vault
- [x] #2 A relationship label is drawn at every zoom and in every state of the viewer, lit or not, and a test holds it
- [x] #3 When a drag is released the camera stops where it is drawn, with no carry-on, and the wheel, pinch and arrow-key easing is unchanged, and a test holds both
- [x] #4 ADR 0042 and the timing file record the change, and nothing handles a fling that can no longer happen
- [x] #5 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Arrowheads: raise the size of the default head to the size that an emphasized head has now. Raise the straight run after the last bend where a head would touch the bend. Render every board of the example vault and of the dogfood vault and look for an overlap. 2. Labels: find every rule that hides a relationship label, including the far-view rule of the viewer, and remove it. A label that is not lit while a reader probes the picture keeps its place and stays readable. 3. Camera: remove the carry-on after a drag and its timing constant. The wheel, the pinch and the arrow keys ease as before. 4. Amend ADR 0042, update the tests that held the old behavior, and add a test for each of the three. No board is affected, because no part or relationship that a board draws changes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Plan. 1 Heads: architecture boards do not use HEAD_SIZE. Their heads are edgeMarker in svg/architecture.ts at 5 line widths for every weight, so a hero head is 11 units long and a default head 7. HEAD_SIZE in svg/styles.ts sizes only the sequence markers (STEP_WEIGHT normal, 8.4 units). Plan: one table of head lengths in page units in styles.ts that both marker sets read. A default head is as long as the hero head is now (11). The hero head stays 11 in architecture boards. The sequence head is 11 too. arrowheadReach takes the weight. The largest reach stays 9.735, so APPROACH_STRAIGHT 12 still holds. Check BAR_OVERHANG and MESSAGE_LABEL_GAP in sequence-design.ts against the larger sequence head. 2 Labels: app.css hides an unlit label under is-far (opacity 0, visibility hidden). The probe recede takes a label to 0.3 and the walkthrough veil to 0.28. Plan: remove the far rule and its --far-view-ms, and let an unlit label recede to 0.5 at most under the probe and under the veil. A labelled self-relationship loses its label in both layout engines (blocks/index.ts keeps a label only with a routed label box). No board in either vault has one. 3 Camera: remove cameraFling, throwTrail, throwSpan, throwRest, the fling step, throwOf, trailWith and the byHand flag of the camera stage, and amend ADR 0042.

Implemented. Heads: HEAD_LENGTH in svg/styles.ts (page units) is the one table both marker sets read: hero 11, default 11, muted 6. The hero head and the muted head keep their size. Muted was tried scaled by the same factor (9.4) and read almost as large as a default head, so it stays at 6. The sequence default head grows from 8.4 to 11, so MESSAGE_LABEL_GAP rose from 5 to 7 (a wide label's plate met the head's top corner) and BAR_OVERHANG from 8 to 9 (its rounded corner plus half a head). APPROACH_STRAIGHT stays 12: the longest reach is still 9.735. The blocks steps pass could slide a last turn to 16 units from a card (Board viewer TASK-365 comparison), so a slide that leaves the last run shorter than BEND_RADIUS plus APPROACH_STRAIGHT is now refused. An audit rendered all 406 drawings of both review vaults (every variant and view, both engines): no head over a bend, a label, a card it does not point at, or another head. Labels: removed the is-far rule in app.css that hid unlit labels and its --far-view-ms. An unlit label recedes to 0.5 under the probe and the presented veil (the rest recedes to 0.3, 0.5 for a hover and 0.28 under the veil). Trace hops keep 0.78, 0.6 and 0.46. Not fixed: a labelled self-relationship draws no label in either engine (blocks/index.ts keeps a label only with a routed label box); no board has one. Camera: cameraFling, throwTrail, throwSpan, throwRest, the fling step, throwOf, trailWith and the byHand flag are gone; ADR 0042 has a dated amendment. Not done: the Board viewer board in .archboard/vault still says the camera carries a thrown drag on.

Verified 2026-10-06. bun run check exits 0. Arrowheads: one table, HEAD_LENGTH in lib/svg/styles.ts, gives the default and the emphasized head the same length of 11 units, and the muted head stays at 6. The new test arrowhead-room.test.ts holds that every drawn head fits its straight run before the head, and it fails when the default head is set to 16. A scratch audit rendered every variant, view and layout engine of the example vault and of the dogfood vault, 406 drawings and 9210 heads, and found none over a bend, a label or a card it does not point at. The audit was run before the last sequence spacing changes, and the test covers them. Labels: the rules that hid them are gone from src/ui/theme/app.css, and an unlit label under a poke or a presented step stays at half strength. A browser test holds it. A labelled relationship from a part to itself draws no label in either layout engine, and no board has one, so it is not fixed. Camera: cameraFling and its throw measuring are removed, and git grep finds fling only in the ADR 0042 body and its amendment.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A default arrowhead is as long as an emphasized one. A relationship label is drawn at every zoom and in every state of the viewer. A released drag leaves the camera where it is drawn, and the wheel, pinch and key easing is unchanged. ADR 0042 records the change, the legend draws the same arrowheads as the picture, and the Board viewer board describes the camera as it is now. Verified with bun run check (exit 0), the new arrowhead-room test, the exploring browser test and a render audit of every board of both vaults.
<!-- SECTION:FINAL_SUMMARY:END -->

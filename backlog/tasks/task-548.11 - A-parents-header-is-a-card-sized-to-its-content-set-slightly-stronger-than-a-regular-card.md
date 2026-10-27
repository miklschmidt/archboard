---
id: TASK-548.11
title: >-
  A parent's header is a card sized to its content, set slightly stronger than a
  regular card
status: In Progress
assignee: []
created_date: '2026-10-27T04:28:00Z'
updated_date: '2026-10-27T06:56:00Z'
labels:
  - renderer
  - layout
dependencies: []
parent_task_id: TASK-548
type: enhancement
ordinal: 965000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Today a parent's header (the card that names a parent at the top of its frame) spans the frame's full width. Every line that leaves or enters the frame from above must then cross it, which is a defect, or detour around the frame, which reads worse (council round 2 of TASK-548.08: 92 header crossings before, and long detours after). The owner decided on 2026-10-27: a header uses normal card sizing, as wide as its content, and its text and icon are set slightly stronger than a regular card's, so it still reads as the parent's name. Lines can then pass beside it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A parent's header is as wide as a regular card with the same text, not the frame's width, in both engines and every theme
- [x] #2 A header's name and icon are set slightly stronger than a regular card's, and a reader can still tell the header from the parent's members
- [x] #3 No line crosses a header, and the hard header checks in expectDrawingIntact pass
- [ ] #4 The grading council judges the changed drawings to read as well or better
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure parent headers with the normal card width rules instead of widening them to their frames. Keep one fixed measured header size per parent. 2. Use 15 px parent names instead of 14 px, with the same medium face, and 20 px parent icons instead of 18 px. Keep the chip and neutral header treatment. Record this modest emphasis in the design note. 3. Share the compact header geometry between layout and painting in both engines and all themes. Route direct parent arrows to that card, and allow descendant traffic through the free top edge beside it. 4. Keep all hard drawing-integrity checks, including both header checks. Add focused width/emphasis and endpoint coverage, inspect the four council acceptance cases, run crate/renderer checks, and deliver complete before/after SVG corpora for the parent council. 5. Keep the task In Progress until the council verdict, with evidence in its notes and Refs: TASK-548.11 on commits.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Folded into the third round of TASK-548.08. The owner design replaces the full-width header slab with a card-sized header. Planned emphasis: 15 px name versus 14 px on a member, and 20 px icon versus 18 px, with the same font face and chip size. Hard header checks remain unchanged. Existing Renderer layout and Semantic renderer task proposals will describe the shared compact header geometry.

The combined Renderer layout@TASK-548.08 and Semantic renderer@TASK-548.08 proposals now describe compact measured headers and the chosen emphasis. Their versions are 111 and 153. ADR 0062 proposes the design and records which earlier header decisions it replaces. The focused measurement regression uses the same measure_node call as production and compares a parent header with a regular card containing the same text.

Round 3 now uses compact measured parent headers in both engines and every theme. Names use 15 px versus 14 px, icons use 20 px versus 18 px, and the far view adds 1 px to fitted name sizes. The matching-core renderer suite passes 653 tests with one platform skip. Both hard header assertions remain unchanged. The four acceptance cases and 23 whole current boards in each engine pass native hard geometry checks. Focused tests cover light, dark, and inherited themes. ADR 0062 and docs/design/compact-parent-headers-and-local-composition.md record the modest emphasis and rejected probes. The Renderer layout and Semantic renderer proposals match the implementation and introduce no new code-check finding. Final corpus and timing evidence will follow. The council criterion remains unchecked and this task stays In Progress.

TASK-548.11 delivery 9a6d1c147 uses compact normal-card width rules in both engines and every theme. Header names use 15 px versus 14 px, icons use 20 px versus 18 px, and the far name gains 1 px. Focused tests cover light, dark, and inherited themes and real parent/member connections. Both hard header assertions remain unchanged. The matching-core renderer suite passes 653 tests with one platform skip, and the complete gate passes, including all 19 browser files. Correction to earlier shorthand: the native scan covers 17 current vault boards plus six fixtures per engine, rather than 23 vault boards. All those pictures and the four exact acceptance requests pass hard geometry checks. The final proposal code check retains 41 old finding identities with none new. ADR 0062 remains proposed, and the Renderer layout and Semantic renderer proposals remain unadopted pending council.

Both SVG sides are saved in /tmp/548-08/round-3/base and /tmp/548-08/round-3/after-1, with 2452 drawings and 76 whole-board views each. The comparison changes 1204 drawings across 19 boards. changed-svg-pairs.json, whole-board-svg-pairs.json, and acceptance-svg/manifest.json name the pairs. The design note docs/design/compact-parent-headers-and-local-composition.md records the modest emphasis, all 20 probes, exact acceptance geometry, fresh performance, changed boards, and remaining tradeoffs. Median first/growth times are 280/203, 299/289, and 140/134 ms for Viewer, Persistence, and Routes. Browser Blocks grows 93.2% in area, Voice retains some long outer routes, and the feedback example adds an ordinary crossing. The parent must grade those tradeoffs. Criteria 1 to 3 are supported by measurement, rendered tests, and visual inspection. Criterion 4 remains unchecked, and TASK-548.11 stays In Progress.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Compact card-sized parent headers are implemented in both engines and every theme. Names use 15 px versus 14 px, icons use 20 px versus 18 px, and the far name gains 1 px. Matching-core width, emphasis, and hard integrity tests pass. ADR 0062 records the proposed design. The complete SVG corpus and four acceptance pairs are under /tmp/548-08/round-3. TASK-548.11 stays In Progress pending council criterion 4.
<!-- SECTION:FINAL_SUMMARY:END -->

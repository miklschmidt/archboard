---
id: TASK-386
title: >-
  A board can be explored by hand: it moves smoothly, answers a poke and opens
  into what is inside
status: Done
assignee:
  - '@claude'
created_date: '2026-10-03 15:13'
updated_date: '2026-10-03 17:36'
labels:
  - frontend
dependencies: []
references:
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - docs/adr/0041-a-recording-is-a-talk-rendered-frame-by-frame.md
  - DESIGN.md
priority: high
type: feature
ordinal: 721000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An architect who did not draw a system learns it by poking at the picture, and today the picture does not answer. Measured on 2026-10-03 on the densest board in the vault, Archboard server (4028 by 3011 units, 23 parts, 52 relationships, drawn at 0.45 of its size when it fits the pane): picking a part draws a ring around it and changes nothing else, so its relationships stay among 50 others of the same weight. Every wheel event zooms by a fixed 10 percent, whatever the wheel did, and a drag stops dead when it is released. Opening a card's board cuts to a new picture: the old one grows 14 percent and fades while the new one assembles, so the reader does not see that the new board lies inside the card they chose.

The subtasks fix these one at a time and keep every constraint of the viewer. The browser reads and writes no board content (ADR 0023). All motion runs on the frame clock, so a recording renders the same frames from the same talk (ADR 0041). Nobody moves a box.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 No frame loop runs on an idle page, and a camera move still re-renders only the board surface (TASK-385)
- [x] #2 Every new motion honors the reduced-motion preference and runs on the frame clock
- [x] #3 semantic render and semantic rasterize write the same bytes as before
- [x] #4 Each subtask is seen working in the browser at 1920x1080 on Archboard server, in both themes
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The five subtasks are done. Together they make the picture answer a hand: the camera moves under it (proportional wheel and pinch zoom, eased keys, a thrown drag, a glide to the whole board), a poke lights what a part is wired to and draws those relationships on, a far view leaves relationship labels out until a part is poked, the list and the picture answer each other (a row lights its relationship, a pick made elsewhere is brought into view, a trace lights what a part reaches), and a card opens its board by flight. ADR 0042 records the decisions, CONTEXT.md gains Light, Trace and Dive, and DESIGN.md gains the Card Is a Window rule.

Evidence for the criteria. No idle frame loop: an idle Archboard server pane asked for no animation frame in three seconds, and semantic-board-stage holds that a rested camera asks for none; semantic-board-camera-renders holds that a camera move draws the surface and nothing around it. Reduced motion and the frame clock: every motion has a reduced-motion test, no new motion code reads a browser clock directly (all of it asks frameClock()), and in a real page the wheel zoom and the dive land at once under the preference. Same bytes: nothing outside src/ui and src/shared/timing changed since the plan, and the whole module suite, renderer and rasterizer included, passes apart from the twelve failures that were there before. Seen working: the flight, the light, the trace and the far view on Archboard server at 1920 by 1080 in both themes.

Twelve module tests and five browser owners fail without this work: ten canvas tests that look for a drill-down slot the shell no longer has, pane-news, navigator-tree, shell-layout, semantic-board-inspection, semantic-drill-boundary, workspace-address and measured-text. I confirmed the last three on a clean checkout of the commit before the dive.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A board can now be explored by hand. The camera zooms by how far the wheel or pinch moved and a released drag carries on (TASK-386.01). A pick, or a pointer at rest, lights what a part is wired to and the rest recedes, with the lit relationships drawn on (TASK-386.02). The selection tab lists a part's connections and a trace lights what it reaches, nearest first (TASK-386.03). A far view shows the structure and brings relationship labels back where the reader looks (TASK-386.04). A card opens its board by a flight into the card, and going back flies out of it (TASK-386.05). The browser still writes nothing, all motion runs on the frame clock, and durations live in EXPLORING_MS. ADR 0042 records why.

Verified with module tests for each subtask, the browser owner semantic-board-exploring (flight, recede and far view in Chromium) beside the existing owners for drill addresses, walkthroughs, traffic and the viewer, a full module run, and stepped filmstrips and screenshots on Archboard server at 1920 by 1080 in both themes. The failures that remain were failing before this work and are listed in the notes.
<!-- SECTION:FINAL_SUMMARY:END -->

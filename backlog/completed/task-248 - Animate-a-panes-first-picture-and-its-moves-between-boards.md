---
id: TASK-248
title: Animate a pane's first picture and its moves between boards
status: Done
assignee:
  - '@claude'
created_date: '2026-09-17 07:35'
updated_date: '2026-09-17 08:15'
labels:
  - frontend
  - motion
dependencies: []
ordinal: 435000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Transitions between pictures of one board are shared-element animations (TASK-234, TASK-246), but everything else cuts. The first picture of a page load pops in; opening another board, switching views and drilling down or back replace the picture with the loading skeleton and then pop the new picture in. The user asked on 2026-09-17 for an entry animation on page load and for transitions between boards.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A pane's first picture, and a picture of another board or view, arrives with a choreographed entry: frames, then cards in reading order, then lines drawn on between cards already there
- [x] #2 Moving to another board or view keeps the outgoing picture on screen while it leaves, instead of cutting to the loading skeleton, and the loading state only shows when drawing takes long enough to need it
- [x] #3 Drilling down reads as going into the card that was opened, and going back reads as coming out of it
- [x] #4 Reduced motion cuts every one of these
- [x] #5 Recorded in headless Chromium before and after, and covered by picture-transition tests
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fit a new picture before paint and at once, so it never slides into place after it is seen.
2. Reveal the waiting state only after a delay; at the user's request (2026-09-17) a centred spinner rather than a skeleton.
3. Entrance for a picture with nothing to carry it from (first, other board, other view): frames fade, cards grow in a wave down the board, lines draw on after, labels with their line. Timings in diagram-motion.ts.
4. Keep the last board's picture mounted while the next is drawn; it leaves the way the reader went (into the opened card, back out, across), inert, with the spinner over it once slow.
5. When the next picture arrives, a ghost of whatever is left of the last finishes leaving where it was seen, under the entrance.
6. Tests: entrance order and landing, hook entrance/cut rules, stage keeps the leaving board inert. Record before/after.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Recorded in headless Chromium (CDP screencast) before and after: page load, drill down, back. Per-frame probes confirmed the camera fits before paint, the ghost stays where the reader saw it, and under emulated prefers-reduced-motion the old picture is gone at the click, there is no ghost and the new picture lands without motion.
The waiting state is a centred spinner revealed after 450 ms (user asked for a spinner instead of the skeleton).
The reading strip above the diagram now keeps one height (49 px) while its contents load: its absence during a first visit to a board moved the pane up 49 px for ~70 ms, which the leaving picture made visible.
The surface carries data-picture-motion while a picture is still moving in; browser owners that read picture markup wait for it to clear (pictureAtRest), fixed in semantic-status-legibility and semantic-board-groups.
Gate: lint, fmt:check, type-check, modules (3172), system (163, without FORCE_COLOR; the colour dependence is fixed separately in 9d7ad1cd), repository (8), serial browser lane all pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pictures with nothing to carry them from (first load, another board or view) build in: frames, cards in a wave down the board, then lines. Moving to another board keeps the last picture, which leaves the way the reader went (into the opened card, back out, across) and hands its remainder to a ghost under the arriving picture. New pictures fit before paint; the wait shows a delayed spinner; reduced motion cuts all of it. Verified with recordings and frame probes in headless Chromium, picture-surface and stage tests, and the full gate lanes.
<!-- SECTION:FINAL_SUMMARY:END -->

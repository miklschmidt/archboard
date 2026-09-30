---
id: TASK-234
title: Animate a pane between pictures of one board with shared-element transitions
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 14:03'
updated_date: '2026-09-15 18:24'
labels:
  - frontend
  - enhancement
dependencies: []
ordinal: 394000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Switching a pane between two variants of one board (or seeing an agent's edit land on the variant it shows) currently drops the picture to a loading skeleton and then paints an unrelated-looking new SVG, so a reader loses which card became which. The layout engine already keeps ids stable across variants and seeds a proposal's layout from its predecessor, so the geometry of most subjects moves a little rather than being redrawn; the browser can show that. ADR 0023 gives transitions to the viewer. Scope: nodes and regions glide and resize between their old and new atlas boxes while the content inside a changed card cross-fades; edges morph their routes; added subjects arrive after the moves, removed ones leave first; reduced motion cuts. Every duration lives in shared timing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Switching between two variants of one board with the same view and theme keeps the previous picture on screen until the next one arrives and then animates shared subjects (nodes, regions, edges) from their previous geometry to the new one; it never shows the loading skeleton between them
- [x] #2 A node or region whose box moved or resized has its frame rects tweened between the old and new boxes; content inside a card whose content changed cross-fades from old to new inside the moving frame, and content that did not change glides without fading
- [x] #3 Edges whose routes changed morph their path geometry between the two routes; subjects present only in the new picture fade in after shared subjects have moved, and subjects present only in the old picture fade out before them
- [x] #4 With reduced motion, a different board, a different view or a different theme, the new picture replaces the old one without animation; a picture arriving mid-transition lands on the correct final state
- [x] #5 The transition's durations and phase boundaries live in src/shared/timing with what they pull against, and the morph arithmetic (path interpolation, box tweening, pairing of subject groups) is covered by module tests without a browser
- [x] #6 A recording of the running viewer switching variants shows the result
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep the previous drawing as placeholder data in semanticRenderQuery while the next picture of the same board loads, so old and new can be bridged. 2. Add lib/path-morph.ts: parse SVG path d (M L H V C Q Z, absolute and relative) into absolute cubic segments, equalise segment counts by splitting the longest chords, interpolate, serialise, and measure length. 3. Add lib/picture-transition.ts: pair subject groups between the old and new SVG by (data-semantic-id, ordinal), classify shared/added/removed, and build a plan of per-frame updaters: frame rects tween between atlas boxes with per-rect offsets, content wrappers translate with the box and cross-fade only when their box-relative markup differs, clip to the moving box; edge paths morph; added subjects fade and scale in after moves, removed clones fade out first; masks and pulses are parked during flight and restored at the end. 4. Add hooks/use-picture-transition.ts owning the surface's markup: cut when the board, view or theme differ or motion is reduced; otherwise run the plan on requestAnimationFrame, finishing an interrupted transition before starting the next. 5. SemanticDiagram keeps one surface element across pictures and marks subjects again after each. 6. Durations and phase boundaries in src/shared/timing/lib/diagram-motion.ts, re-exported by timing.ts. 7. Module tests for path-morph and the pairing/plan; stage test updated for the kept picture. 8. Record the running viewer switching variants.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: semanticRenderQuery keeps the last picture of the same board (by the previous query key's board) as placeholder data; SemanticDiagram keeps one surface and usePictureTransition writes the picture into it, publishing the staged picture through an external store so the marks re-run; picture-pairing pairs subject groups by (id, ordinal) and boxes each group by its own largest rect (atlas fallback); picture-cards tweens frame rects and frame lines with per-part offsets, cross-fades old/new content and old/new frame look over one window inside an untransformed clip holder; picture-lines morphs path d through path-reading/path-morph (cubic chains, equalised by splitting the longest segment) and draws new lines on with a dash; removed subjects are borrowed and fade first, added ones grow/draw in last. Verified with headless Chromium stills at 6x slow on Semantic renderer (both directions) and Renderer layout in the Render sequence view. Durations and phases in src/shared/timing/lib/diagram-motion.ts.

Validation: bun run lint (baseline + policy) clean; bun run fmt:check clean; type-check clean; bun run test:modules 3104 pass; test:repository 8 pass; test:serial-browser all files pass. Headless-Chromium stills at 6x slow confirmed the choreography on Semantic renderer (both directions) and on Renderer layout through the Render sequence view; real-time screencast encoded to ~/archboard-variant-transitions.mp4 (1920x1080, 60 fps, 19 s: Semantic renderer both ways, Renderer layout in Render sequence both ways, then one switch at quarter speed). Test change: the stage variants test used to assert the surface is absent during the request; it now asserts the last picture stays until the next lands.

Follow-up from review: line paths are now paired by job (halo, stroke, swipe) rather than by position, so a stroke that gains or loses a standing's swipe morphs with it and its look cross-fades against a borrowed copy of the old stroke; a card's swapped content drops away as it fades while the new content settles down into place from above (CONTENT_DROP in picture-cards), with the content clipped to the frame whenever it swaps. Verified again with slowed stills and a fresh recording.

Second review round: a card's content is paired element by element (pairContent), so unchanged titles, descriptions and chips are kept and glide while only changed elements swap; the swap is sequential — what leaves drops and fades over fadeStart..swapAt, then what arrives settles down from above over swapAt..fadeEnd (swapAt added to PICTURE_TRANSITION_PHASES). linePaths had let the stroke overwrite the swipe entry, so swipes never animated; it now sorts halo, stroke and swipe explicitly and a test holds the swipe and stroke to arriving together.

Third review round: marks astride a card's edge — a standing's pin, a warning badge, told by a translate within MARK_MARGIN of the box's edges — ride in their own wrappers outside the clipped holder, so they are never cut to a sliver in flight; a test holds a pin to arriving outside the clip. The earlier recording's last segment showed the frontend-missing page because the browser lane rebuilt dist while the screencast ran; recordings now run alone.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A pane now carries one picture of a board into the next instead of dropping to a skeleton and repainting: the render query keeps the last picture of the same board as placeholder data, the diagram keeps one surface whose markup usePictureTransition writes, and transitionPicture choreographs the new picture's own markup — shared cards, containers, labels and lifelines glide and resize between their old and new boxes (own largest rect, atlas fallback) with changed content and changed frame looks cross-fading inside a clipped holder, routes morph as equalised cubic chains, subjects only the old picture had are borrowed and fade first, subjects only the new one has grow or draw on last; another board, view or theme, or reduced motion, cuts; a picture arriving mid-flight lands the flight first. Durations and phases live in src/shared/timing/lib/diagram-motion.ts. Verified with 23 new module tests (path reading and morphing, pairing, cards, lines, arrivals, departures, finish, the hook's interrupt), the updated stage variants test, the full lint/format/type gate, the module, repository and browser lanes, headless-Chromium stills at 6x slow on two boards and two grammars, and a real-time screencast at ~/archboard-variant-transitions.mp4.
<!-- SECTION:FINAL_SUMMARY:END -->

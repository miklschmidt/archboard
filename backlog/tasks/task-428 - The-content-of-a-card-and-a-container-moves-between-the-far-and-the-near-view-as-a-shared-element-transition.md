---
id: TASK-428
title: >-
  The content of a card and a container moves between the far and the near view
  as a shared element transition
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 19:31'
updated_date: '2026-10-07 01:59'
labels:
  - frontend
  - renderer
  - design
dependencies: []
references:
  - docs/adr/0042-the-picture-answers-the-hand-and-a-card-opens-by-flight.md
ordinal: 785000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When the picture is zoomed past the point where cards swap their near words for their far name, the two layers cross-fade (FAR_VIEW_FADE_MS). The owner wants a nice shared element transition between the far and near content of containers and cards: the icon chip should move and scale from its far place to its near place, and the title and the responsibility should move and fade, instead of two layers that fade over each other. The swap waits for the camera to rest (TASK-405), and the cost of a swap on a large board must stay low.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 On a card and on a container header the icon chip is one element that moves and scales between its far and its near place, and the title and the responsibility move and fade between their places, in both directions, in the light and the dark theme
- [x] #2 A swap on a large board stays smooth: the frame time during a swap on the Archboard server board is measured before and after with the method of TASK-405, and the numbers are in the notes
- [x] #3 Reduced motion cuts, a swap during a flight or a drag behaves as TASK-406 says, every duration lives in the timing file, and a test holds the structure
- [x] #4 ADR 0042 records the transition, and bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make the chip of a card, a container header and a sequence card one element outside the near and far layers, drawn near by its own transform attribute, with its near and far places as properties that the picture's stylesheet switches on is-far. 2. Put each view's words in a group that the stylesheet moves to where the other view's words start, at the other view's size, while its view is hidden; the leaving words fade out early and the coming words fade in late. 3. Keep the marks, badge and pin where they stand. 4. Measure a swap at rest on the Archboard server board before and after (GPU and software), with the TASK-405 method. 5. Keep exports, readers without the stylesheet, reduced motion, standalone themes, the dive and picture transitions working. 6. Test the structure, amend ADR 0042, run the checks.

Completion evidence: Board viewer@TASK-405 and Semantic renderer@TASK-423 record the rest-held shared-element swap and the complementary fade without adding a separate architecture fork for the same built state.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Construction (2026-10-06): far-view.ts sharedChip draws the chip once (typeChip at the origin) in <g class="ab-chip" transform="translate(near) scale(1)" style="--near:...;--far:...">, outside .ab-near and .ab-far. movingWords wraps a view's words in <g class="ab-words" style="--away:...">, the move and scale that put its first baseline on the other view's first baseline at the other view's size (the scale is rounded to a ten thousandth before the move is worked out, so a word far from the origin does not drift). far-card.ts paintCardViews and paintHeadingViews draw both views of a card, a container header (measured-cards.ts) a sequence card (cards.ts) and a flow heading (dataflow.ts). document.ts farViewRules: .ab-chip{transform:var(--near)}, .is-far .ab-chip{transform:var(--far)}, .ab-far>.ab-words and .is-far .ab-near>.ab-words take var(--away), all transforms 280 ms cubic-bezier(.4,0,.2,1); the leaving layer fades out in the first 60 percent, the coming one fades in during the last 60 percent; reduced motion cuts. FAR_VIEW_FADE_MS (180) became FAR_VIEW_SWAP_MS (280) in timing. standingAlone skips properties the document sets on its own elements, so a standalone theme names no colour for --near/--far/--away; the theme test reads tokens the same way. The viewer: picture-pairing.ts compares a card's content without the properties an element's style sets, so a card that moved keeps its chip and words in a picture transition (the fixture now draws the shared chip; the test fails without the fix). picture-dive.ts fades the chip with the card's words in a flight.

Measurement: swap at rest on 'Archboard server' (proxy and private server as in TASK-405), 13 wheel notches in across the far line, wait for the swap, 13 out; frames from each swap to 450 ms after; 3 runs, 2 swaps each. Before = clean export of af275a1bd, after = the same with my files. GPU: mean 17.0 vs 17.0 ms, slow frames (over 25 ms) 1 of 55 vs 1 of 55 (2 of 6 swaps vs 3 of 6), slowest 33 vs 33 ms, paint 62 vs 117 ms per run. Software: mean 23.7 vs 25.7 ms, slow 13 of 40 vs 15 of 37, slowest 67 vs 50 ms. The one slow GPU frame is the frame of the class flip, before and after: a task of about 28 ms where the browser styles every near and far layer again (visibility is inherited, so their whole subtrees) and the camera's layer goes at rest; the moving frames after it stay at 16.7 ms. A test with visibility left visible cut that task to about 17 ms, but hidden layers would then be painted, so it was not kept. Limiting to on-screen cards was not needed by the numbers. Visual check: frames of the swap seeked at 0, 60, 120, 170, 230 and 280 ms in both directions and both themes (scratchpad cam/results/seek-*.png): the chip grows from the chip to the tile and back, the words move and fade, the marks fade in place.

Commits: bd98df150 (renderer: shared chip, moving words, stylesheet, timing, structure test, theme test), 44819ee6a (viewer: picture transitions compare content without the placed properties, the dive fades the chip), 324a660d8 (ADR 0042 amendment). measured-cards.ts was staged from my own hunks only (the slab agent's port and shadow hunks in that file stay unstaged). Checks: type-check and lint clean on my files (lint reported complexity errors in architecture.ts and ports.ts during the slab agent's work in progress, which later passed); fmt:check clean; bun test --isolate src/runtime/semantic-renderer src/transformers src/shared src/ui 1901 pass; the staged snapshot of the renderer commit type-checked and passed 857 renderer and canvas tests on its own; picture browser owners (browser-drawn-pictures, semantic-board-exploring, semantic-board-viewer, measured-text, semantic-board-groups, semantic-traffic): 7 pass, 0 fail. bun run check as one command was not run.

Flash fix (2026-10-07, owner: 'the transition between far view and near view makes the card content flash'). Cause: the leaving words faded out in the first 60 percent and the coming words faded in during the last 60 percent, so in the middle of the swap the ink of a card's words fell to about a tenth of its steady value while the chip scaled. Fix: both views fade over the whole FAR_VIEW_SWAP_MS (280 ms) with one easing (cubic-bezier(.4,0,.2,1), no overshoot) and no delay, so the coming view is exactly as opaque as the leaving view is clear; the coming view is visible from the first frame (visibility 0s) and the leaving view hides only after its fade (visibility 0s linear 280ms). The words of both views keep their shared first baseline, which moves at one size all the way. A zoom now comes to rest over two frames (use-board-camera comeToRest): the camera layer goes first, the far view follows one frame later, so the swap does not start in the frame that draws the whole picture again; a pan comes to rest at once (no size changed).

Verification (scratchpad cam/ink.ts, frames decoded and measured: ink = summed luminance change against the same card with no content, in the area right of the chip, plus the count of pixels changed by more than 24): board 'Board viewer', two cards and a container header, GPU, both themes. Ratios: lowest ink against the lower steady value, highest against the higher.
Seeked (transitions paused and stepped every 16 ms from -32 to +320 ms): before 0.10-0.16 lowest to far and 0.07-0.12 to near; after 1.00 lowest, 1.02 highest in both directions and both themes.
Real frames (screencast) after a fit glide to far: before 0.12-0.41; after 1.00 lowest, 1.18 highest (light), 1.00 (dark). Real frames after a wheel zoom in to near: before 0.08-0.13; after 0.96-1.00 lowest, 1.03 highest.
Real frames after a wheel zoom out to far: after, one frame at the start of the swap has 0.72-0.96 of the ink before it: that is the picture drawn sharp after the camera's layer goes (TASK-405); a zoom out that ends with no swap shows a step of the same size, up or down, so it is not the swap. The longest gap between real frames at the swap start went from 80 ms (before) and 66 ms (complementary fade alone) to 44-52 ms with the two-frame rest. The pixel count rises to 1.1-1.4 times in the middle of a swap because faint pixels of both views are counted; the ink stays steady. Before and after frame strips: cam/ink/compare-grid.png.

Flash fix committed as e03e16942 (document.ts swap rules, FAR_VIEW_SWAP_MS note, use-board-camera two-frame rest, far-view-swap test of the complementary fade, ADR 0042 amendment of 2026-10-07). Checks: type-check, lint clean; module tests 1909 pass; the staged snapshot type-checked and passed 865 renderer and canvas tests on its own; picture browser owners pass (semantic-traffic first failed because another agent's half-done drill-mark.ts edit broke the server import, then passed on a rerun). far-view.ts and drill-mark.ts carry another agent's uncommitted edits and were not staged.

Architecture completion (2026-10-07): the adopted Board viewer@TASK-405 and Semantic renderer@TASK-423 carry this implemented transition. The renderer has bound Near and far content (far-card.ts), whose paintCardViews calls sharedChip and movingWords (far-view.ts), and SVG document records the complementary opacity/transform rules (document.ts:206). The viewer retains Picture transition and Place a board in its card ids and documents carrying shared chip/words and fading the chip during a dive. The camera controller records the two-frame zoom rest from e03e16942; it lets the camera layer go before the near/far swap starts. Comparisons, proposal images and dogfood check were inspected; no new performance measurement or external owner visual acceptance is claimed.

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Cards and headers share one icon chip and moving text across the near and far views. Browser measurements and transition owners pass. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

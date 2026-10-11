---
id: TASK-406
title: Opening a board from a card holds the zoom-based text until the flight ends
status: Done
assignee:
  - '@claude'
created_date: '2026-10-06 09:53'
updated_date: '2026-10-07 01:59'
labels:
  - frontend
dependencies: []
references:
  - docs/adr/0042-the-picture-answers-the-hand-and-a-card-opens-by-flight.md
ordinal: 747000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a reader double-clicks a card that opens a board, the camera flies into the card (the dive, ADR 0042). While it flies the zoom crosses the point where a card swaps its near words for its far name, and the title and the responsibility text change or are drawn again in the middle of the flight. This makes the flight stutter and look bad. The bug existed before the slab work. The owner wants the swap held until the flight is over, and a nicer transition.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 During a flight into a card no card, header or caption swaps between its near and far layers, and no zoom-based text is measured or drawn again, and a test holds it
- [x] #2 When the flight ends the update is applied once and eased in, not cut
- [x] #3 Flight frame time is measured before and after, with the numbers in the task notes. The flight preserves picture sharpness.
- [x] #4 A board opened by the plain way, with reduced motion or with no prefetched picture, behaves as before
- [x] #5 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Find what swaps the near and far layers and what measures zoom-based text, and when (the is-far class, the far layer fade, any hook that reads the camera scale). 2. Find which of them runs during a dive flight. 3. Hold the swap and the text update while a flight runs, and apply them once, eased, when the flight ends. 4. Measure the flight before and after, and add a test that counts the swaps during a flight. 5. Amend ADR 0042 and run bun run check.

Revised after measuring: 6. The dive holds the camera's rest from takeoff until the pane has taken over and fitted the board flown to, so the far view of the surface does not change in the flight or at the hand-over; the board inside the card inherits the surface's class instead of carrying its own. 7. When the hold ends the far view takes the opened board's value once, with the picture's own eased cross-fade. 8. The board inside the card is styled and laid out before the glide starts, so the first frame of the flight does not carry that work.

Completion evidence: Board viewer@TASK-405 carries the flight hold. Keep the reported frame-time result and the unmet lower-after requirement visible; no acceptance criterion is marked from this documentation correction.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured before any change (2026-10-06), with the method of TASK-405 (private server on a copy of the dogfood vault, 1920 by 1080 headless Chromium over CDP, medians of 3 runs). Scenario: the board 'Archboard server' fitted whole (scale 0.32, seen from far), wait 4 s, double-click the card 'Semantic renderer', which flies into the board 'Semantic renderer'. A MutationObserver over the whole stage records every change of the is-far class (on the surface or on the board inside the card) and every class and child mutation; a transitionrun listener counts the cross-fades of the .ab-near and .ab-far layers; a requestAnimationFrame loop records frame intervals between the start of the flight (data-camera-motion set) and its end.

What happens today: during the flight the camera glide writes the surface's transform directly and does not write the camera store, so the far class does not change in the flight itself (0 toggles, 0 fades). But at the end of the flight the camera store is written with the camera over the parent at the card (scale about 3.5, near), so the far reading flips to near; the board that opens is then put up on a surface without is-far, so its cards draw their responsibility text; then the fit puts the camera at the board's own fit (far) and is-far comes back: 1 toggle and 32 near/far cross-fades start about 15 ms after the board changes. The reader sees the board inside the card drawn with names, then the opened board with its responsibility text, then a 180 ms fade back to names.

BEFORE, GPU: flight frame mean 32.6 ms, p95 50 ms, max 67 ms, 23 frames in about 750 ms, 15 over 25 ms; 1 far toggle and 32 fades right after the hand-over; 2 long tasks (194 ms). BEFORE, software: flight mean 63.3 ms, p95 133 ms, 10 frames, 9 over 25 ms; 1 far toggle and 32 fades after; 3 long tasks (217 ms).

Plan item 8 (lay the board inside the card out before the glide starts) was tried and dropped: on the GPU the flight's frame times did not change (flight mean 24.4 ms before, 23.6 ms with it, within the run-to-run spread), so it added a forced layout for nothing measurable. The flight itself is bound by the GPU, which rasterizes both pictures again at every frame of a zoom of more than ten times. A layer of its own for the surface during the glide (will-change: transform) cut the GPU flight mean from 32.6 ms to 21.1 ms in one test, but the lines of the board inside the card were drawn faint and soft for most of the flight (the layer keeps the raster scale of the start), and the board then took over sharp. That is a visible event of its own, so it was not kept.

AFTER (2026-10-06). The recorder was fixed to follow a batch of class changes one by one (the first count of 1 toggle was an undercount). Fresh runs, GPU, medians of 3, double-click 'Semantic renderer' on 'Archboard server' (both seen from far):
BEFORE: 0 far changes in the flight, 2 in the 600 ms after it (far to near when the flight wrote its close-up camera, near to far after the fit), 32 near/far cross-fades after the hand-over, 14 class mutations on the stage.
AFTER: 0 far changes in the flight, 0 after, 0 cross-fades, 13 class mutations.
Flight frame time: GPU mean 20.9 ms before, 21.7 ms after (p95 33.4 both); an earlier interleaved run gave 23.7 and 22.4. Software 60.6 and 60.6. So the flight is not faster: its cost is the browser drawing two pictures again at each frame of a zoom of more than ten times, and that is not what this task changed. AC #3 (lower after) is not met; the swap and the fades the owner saw are gone.
What changed: the board inside the card has no is-far of its own and is drawn as the picture around it is. The flight holds the camera's rest from takeoff (camera.hold) until the pane shows the board it flew to and has fitted it; then the far view follows the fit once, with the picture's own 180 ms fade. With reduced motion, the plain way, or no prefetched picture there is no flight and nothing is held.
Tests: semantic-board-dive (a flight between two boards seen from far changes no far view; a board seen from far that opens from a board seen near swaps once, after it has taken over; both fail without the hold), semantic-board-exploring browser owner (no card layer fades while the board flown from is on screen, one swap after, and the board flown to fades; it fails without the hold on the fade, because the swap then lands as a cut in the hand-over commit). The browser owner passed (bun tests/system/browser/run-browser-lane.ts --focus tests/system/browser/semantic-board-exploring.test.ts).

Whole serial browser lane after the commits: 24 pass, 0 fail. Commits: a26319999 (fix), e4241f29f (ADR 0042 amendment).

Architecture completion (2026-10-07): Board viewer@TASK-405 also documents this task. Fly into a card still has its original id and binding; its relationship to camera controls now names the controller and its hold. Evidence: use-dive.ts:176 calls camera.hold before the flight and releases it after pane takeover; the child picture inherits the held reading. TASK-428 later replaces the 180 ms cross-fade stated in these historical notes with the 280 ms shared-element complementary fade. AC #3 remains unmet: the recorded flight cost did not fall (GPU 20.9 ms before, 21.7 ms after; software 60.6 ms both). The visible extra swaps were removed; no faster flight is claimed and no failed criterion is checked.

Owner decision (2026-10-07): close for the text fix and preserve sharpness. The owner waived the lower-after performance target. The original measurements remain above. A trial of opacity wrappers did not show a reliable gain and was removed.

Final acceptance uses the recorded measurements, rendered owners, browser evidence, and later owner choices in these notes. The final bun run check passes on the simplified shadow implementation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Board flights hold the text state and ease the final handover. The owner accepted the text fix and preserved sharpness without a speed claim. Flight owners pass. The final bun run check passes.
<!-- SECTION:FINAL_SUMMARY:END -->

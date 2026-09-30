---
id: TASK-382
title: A recording's picture renders in no more time than its talk took
status: Done
assignee:
  - '@claude'
created_date: '2026-09-30 04:27'
updated_date: '2026-09-30 10:27'
labels:
  - recorder
  - renderer
dependencies: []
priority: medium
type: feature
ordinal: 666000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-381 made a recording two passes: the live talk, then its picture rendered frame by frame in software headless Chromium. On 2026-09-30 a real recording of the web-shop walkthrough (85.3 s, 2560 frames) rendered in 211 s, about 83 ms a frame, so an agent waits about 2.5 times the talk again after the voice is done. TASK-381 deferred faster rendering until a measurement showed more than about twice the talk; this one does. The render is sequential because a step does not begin at rest (subtitles linger across steps, traffic runs continuously), so a second page must fast-forward to its first frame. Options named in the TASK-381 design (docs/adr/0041): split the frames across a few pages, each playing the talk forward uncaptured to its range, and multiplex their JPEGs into one ffmpeg in order; or reuse the last JPEG when a frame changes nothing (no event, no running animation, no SMIL, no pending frame request). Frames must stay byte-identical to the sequential render.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A real recording of the web-shop walkthrough renders its picture in no more time than its talk lasted, measured on a quiet machine
- [x] #2 Two renders of one talk give byte-identical frames, as walkthrough-replay.test.ts holds
- [x] #3 A render still fails as RENDER_FAILED and keeps the talk when a frame cannot be drawn
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Measured first (2026-09-30, the real web-shop talk, 1920x1080, software Chromium): a frame costs 6.4 ms of page work and 78.9 ms of screenshot. Lifting the frame-rate limit (--disable-frame-rate-limit --disable-gpu-vsync) halves the screenshot to 36 ms and keeps renders byte-identical. A page that draws frames without screenshots (about 9 ms each) and then captures draws the same bytes as a sequential render. Six renderers at once scale nearly linearly (9 ms a frame together).
1. renderFlags gains the two frame-rate flags.
2. renderTalk draws on several pages at once, each in its own Chromium: every page draws every frame, and page k captures seconds k, k+n, ... (interleaved one-second chunks, which balances the load and bounds memory). Pages: a quarter of the machine's threads, at most six, one per 300 frames; RenderTalkRequest.pages overrides for tests.
3. lib/frame-order.ts hands the frames to the one ffmpeg in order, holding early ones, with a page at most two rounds of seconds ahead (one encoder keeps frame timing exact; ffmpeg segment joins were measured to leave 66 ms gaps with B-frames or 1 ms rounding).
4. A failure on any page stops the others; RENDER_FAILED as before; cancel stops all browsers.
5. walkthrough-replay.test.ts renders one copy on two pages and must match the one-page frames; docs (ADR 0041, INSTALL, acceptance, skill) state the new time.
Board proposal: Board rasterizer@TASK-382.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured 2026-09-30 on the real web-shop talk (85.3 s, 2560 frames): page work 6.4 ms and screenshot 78.9 ms a frame on one page; without the frame-rate limit 38.4 ms a frame; a frame drawn without a screenshot about 9 ms; six renderers at once 9 ms a frame together. semantic replay of that talk with the split render took 48.8 s in all (nix probe, six browsers, encode), 0.57x the talk, while an evals agent worked in its own worktree; its decoded picture is bit-identical to the one-page render made before the change, every frame 33.333 or 33.334 ms apart, bt709 tagged. Segments joined by ffmpeg were rejected: H.264 with B-frames left 66 ms gaps at each join, and Matroska and WebM round to 1 ms.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A talk's picture now renders in about half the talk's length on a machine with many threads. The render lifts Chromium's frame-rate limit (a screenshot no longer waits for the display: 79 to 36 ms), and draws the talk on up to six pages at once, each in its own Chromium: every page draws every frame, and each captures its own interleaved seconds; lib/frame-order.ts hands the frames to the one ffmpeg in order with a bounded look-ahead. Verified: bun run check green; walkthrough-replay.test.ts renders one copy on two pages to the same frames as one page; walkthrough-render.test.ts keeps the RENDER_FAILED path; the real 85.3 s talk rendered in 48.8 s (0.57x) and decodes to the same picture as the one-page render. Board rasterizer adopts the Frame order part.
<!-- SECTION:FINAL_SUMMARY:END -->

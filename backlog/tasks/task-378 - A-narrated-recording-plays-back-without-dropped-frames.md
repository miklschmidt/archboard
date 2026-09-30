---
id: TASK-378
title: A narrated recording plays back without dropped frames
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 18:33'
updated_date: '2026-09-30 01:27'
labels:
  - voice
dependencies: []
priority: medium
type: bug
ordinal: 662000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recordings made 2026-09-29 one at a time on a quiet machine with archboard semantic record (1920x1080, 30 fps) hold a frame for 200 to 285 ms between 14 and 25 times in a 90 to 110 s video, mostly while only the subtitles and the traffic dots move. A performance trace of the same step change in a live pane showed no main-thread task over 30 ms, so the stalls come from the recording path: the recording page captures its own tab and encodes it. The README's narrated videos and their WebP excerpts carry these holds.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A recording of a README walkthrough on a quiet machine holds no frame longer than 50 ms while anything on screen moves
- [ ] #2 The cause is named in the task notes, with the measurement that shows it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Measure: record the three README walkthroughs before any change; classify each frame gap over 40 ms as while moving or at rest (picture changed across the gap or not); trace one recording (capture track frames in the page, Chromium trace, capture oracle VLOG) to find where frames drop.
2. Cause (found, see notes): Chromium's tab-capture oracle (media::VideoCaptureOracle) runs an AnimatedContentSampler. While one screen region animates steadily it samples only frames that damage that region; once that animation stops it keeps ignoring every other damage for its 250 ms non-animating threshold. So each time a glide, cross-fade or other steady animation stops while subtitles or traffic dots still change, the capture sends no frame for 267 to 284 ms.
3. Fix in the recording stage (src/ui/walkthrough-recording/components/RecordingStage.tsx, utility in src/ui/theme/app.css): an invisible full-viewport layer whose opacity animates between 0.001 and 0.0015 of black, below half a colour level, so every compositor frame damages the whole viewport. The sampler then always sees one steady full-frame animation and samples at a steady 30 fps; no stopping animation can latch it. Picture and 1080p30 output unchanged.
4. Test: one module owner in src/ui/walkthrough-recording/tests that the stage keeps the frame pacer (hidden from assistive tech, not hit-testable).
5. Docs: amend ADR 0035 (the stage repaints its whole frame every frame, and why); add an observation row to docs/design/walkthrough-recording-acceptance.md.
6. Board proposal: Board rasterizer@TASK-378 (Recording page description states the steady capture). No part or relationship changes.
7. Verify: record the three walkthroughs after the fix, report gaps split while moving / at rest; run bun run check under the memory scope.

8. GPU compositing for recordings only (2026-09-30): the recorder starts Chromium with --enable-gpu and --disable-gpu-rasterization (src/runtime/walkthrough-recorder/index.ts recordingFlags); Chromium falls back to software compositing without a usable GPU, so no probe or option. The rasterizer keeps --disable-gpu. Owner: src/runtime/walkthrough-recorder/tests/browser-flags.test.ts.

9. Shader warm-up: the recording page draws the subtitle box for two frames before it captures its tab (src/ui/walkthrough-recording/lib/rehearsal.ts, rule in app.css), so the GPU has compiled the blurred scrim's shaders before the first words.

10. Board: Board rasterizer@TASK-378 was branched before TASK-380 was adopted; shelved with that reason, change restated on Board rasterizer@TASK-378-gpu (from the current variant) with the GPU and warm-up added; adopt it at closing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause, measured 2026-09-29 on a quiet machine (load < 2):
- Holds: Chromium's tab-capture oracle (media::VideoCaptureOracle) runs an AnimatedContentSampler. When one damage rect repaints steadily for >= 1 s it locks onto it and samples only frames whose damage equals that rect; once that animation stops it keeps the lock (and ignores all other damage) until 250 ms have passed (kNonAnimatingThresholdMillis). Evidence: (1) the page's own capture track (MediaStreamTrackProcessor on a clone) and the Chromium trace show the gaps at the capture source (gpu.capture 'Capture' events stop, every compositor frame is 'FpsRateLimited' with a full token bucket), while rAF in the page ran at 60 Hz with no gap > 50 ms, and the encoder encoded every delivered frame; (2) with --vmodule=video_capture_oracle=1 every hold ends exactly when the oracle logs 'Content sampler detects animation ended' (9 of 9 in one Archboard recording, e.g. hold at 18.38 s <-> log 21:28:30.56, offsets identical); (3) a Codex-free repro (a 1400x800 box pulsing for 2.5 s, stopping, while dots move inside it) holds 267-283 ms every time it stops, and 0 times with the fix.
- Single dropped frames (67 ms): asking getDisplayMedia for frameRate 30 also caps the track (VideoTrackAdapter, max_frame_rate 30, drift-based drop). Trace: frame 260 reached VideoTrackAdapter::DeliverFrameOnVideoTaskRunner but never VideoTrackRecorderImpl::OnVideoFrame, with its timestamps 33.28 ms apart. Without the constraint the tab is still captured at 30 fps (Chromium's kDefaultScreenCastFrameRate; track settings report 30) and the track is uncapped: 901 delivered, 901 encoded.
- Residual, separate cause: the Web shop step 1->2 view-change glide with the veil cross-fade. Headless Chromium's software display compositor (VizCompositorThread) is busy 520 of 550 ms, DirectRenderer::DrawFrame 16-29 ms per frame (about 38 filter render passes), so the capture gets 40-45 ms intervals with some at 50-59 ms. It is the same before the fix: two unfixed recordings of that walkthrough held 48, 50, 52, 53 and 59 ms in that glide.
Fix: the recording stage lays a layer behind its opaque background (recording-frame-pacer in app.css) whose opacity animates on the compositor, so every frame damages the whole viewport. The sampler's lock is then always the whole frame and never ends. The layer is occluded, so no pixel changes: a red test layer left no red pixel, and frame means were equal. It costs about 2 ms more display-compositor time per frame at rest (5.6 -> 7.8 ms per draw). The capture no longer names a frame rate. Rejected: a 30 Hz stepped pacer (phase jitter gave 67 ms gaps), a 31 fps ceiling (the sampler then double-sampled every 0.5 s and the track dropped frames), 60 fps capture with a 30 fps clone (drift drops, and the glide was no better), SwiftShader GPU compositing (20 fps at rest).

Verification (one recording at a time, fresh scratch servers, 1920x1080, dark). Gaps over 40 ms are split by whether the picture changed across the gap (moving) or not (at rest):
- Archboard 'Read this board': before 9 holds >= 150 ms, 15 gaps > 50 ms, max 284 (20 moving, max 284). After (/tmp/t378/after2-ab.mp4): 0 holds, 0 gaps > 50 ms, max 45 ms (moving max 45, at rest max 41).
- Web shop@Queued fulfilment 'Why checkout stops waiting': before 4 holds, 5 gaps > 50, max 283 (two more unfixed runs: 4 holds each, max 283). After (/tmp/t378/after2-ws.mp4): 0 holds, 5 gaps > 50 ms, max 75 ms. All five fall inside the step 1->2 view-change glide (23.5-24.4 s), the residual that the notes above describe.
- Inventory service 'How stock is reserved': before 10 holds, 14 gaps > 50, max 284. After (/tmp/t378/after2-inv.mp4): 0 holds, 1 gap > 50 ms (52 ms, at rest), moving max 42 ms.
Test: src/ui/walkthrough-recording/tests/steady-capture.test.tsx. Gate: bun run check exit 0 under a 16G memory scope, 3905 pass and 0 fail.
AC #1 holds for Archboard and Inventory. It does not hold for the Web shop view-change glide, where the software compositor limits the frame rate (a pre-existing cause). The parent decides whether that becomes a follow-up.

GPU compositing, 2026-09-30 (quiet machine, one recording at a time, fresh scratch servers, 1920x1080, dark, English).
Why software: headless Chromium (153.0.8010.36, /run/current-system/sw/bin/chromium) disables hardware GPU unless started with --enable-gpu. CDP SystemInfo.getInfo before: gpu_compositing disabled_software, rasterization disabled_software, video_encode disabled_software, GL renderer "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))" (gl=egl-angle, angle=swiftshader). With --enable-gpu --disable-gpu-rasterization: gpu_compositing enabled, rasterization disabled_software, video_encode disabled_software (no hardware encode, not chased), GL renderer "ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 4090/PCIe/SSE2, OpenGL ES 3.2 NVIDIA 595.99.02)" (gl=egl-angle, angle=opengl). --use-angle=vulkan with --enable-features=Vulkan,DefaultANGLEVulkan,VulkanFromANGLE also enables it (Vulkan 1.4.329 on the 4090); --ignore-gpu-blocklist alone changes nothing. nvidia-smi listed the recording's gpu-process (96 MiB) mid-recording.
Choices measured on Web shop@Queued fulfilment 'Why checkout stops waiting': software (before, HEAD) 4 gaps > 50 ms, max 53, all in the step 1->2 glide; GPU GL with GPU raster: glide steady at 33 ms but 67 and 83 ms holds where a step drew new content; GPU Vulkan with GPU raster: 106 and 67 ms, same cause; GPU GL compositing + software raster: max 49 ms. Chose --enable-gpu --disable-gpu-rasterization.
Residual found with GPU compositing: one hold of 58 ms (100 ms under tracing) when the first subtitle appeared. Trace: SkiaOutputSurfaceImplOnGpu::FinishPaintRenderPass 87 ms on CrGpuMain with 4 GpuPersistentCache stores = shader compilation of the subtitle box's backdrop-blur scrim on first draw (a Codex-free repro: first appearance of such a box 58 ms, second none). Fix: the page draws the subtitle box for two frames before it captures its tab (rehearsal.ts). Traced again: the 53 ms compile now lands before the first captured frame, and the video's max gap is 42 ms.
Final recordings (product code, no wrapper): Web shop /tmp/t378/gpu/final-ws.mp4: 0 gaps > 40 ms, max 36 ms. Inventory /tmp/t378/gpu/final-inv.mp4: 1 gap > 40 (43 ms, moving), max 43. Archboard /tmp/t378/gpu/final-ab.mp4: 0 gaps > 40, max 39 ms. First frames show no subtitle box.
Fallback: with the GPU hidden (__EGL_VENDOR_LIBRARY_DIRS, VK_ICD_FILENAMES, VK_DRIVER_FILES, LIBGL_DRIVERS_PATH pointed at nothing), Chromium with the recording flags reports gpu_compositing disabled_software (gl=none) and the Web shop recording still succeeds (/tmp/t378/gpu/nogpu-ws.mp4; its gpu-process absent from nvidia-smi): max 57 ms, the software glide as before.
Rasterizer unchanged: RASTER_FLAGS keep --disable-gpu, so PNGs and the measured-text contract are untouched.
<!-- SECTION:NOTES:END -->

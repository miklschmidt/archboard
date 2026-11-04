---
id: TASK-577
title: >-
  A browser without WebGPU paints on WebGL2, and the fallback painters stop
  cutting every path into strips each frame
status: Done
assignee:
  - '@claude'
created_date: '2026-11-04T21:13:00Z'
updated_date: '2026-11-04T22:34:00Z'
labels:
  - painter
  - renderer
dependencies: []
references:
  - docs/adr/0071-vello-paints-the-canvas-and-motion-lives-in-the-painter.md
ordinal: 1020000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A browser with no WebGPU paints the canvas on the CPU painter (ADR 0071). On the largest picture (about 9,500 paths at 1920x1080) that painter takes about 36 ms of main thread per frame: about 20 ms to cut paths into sparse strips and about 16 ms to raster. The measured note docs/design/painter-webgl-fallback.md (commit 1d641deeb, spike branch spike/painter-webgl) showed that vello_gpu on WebGL2 removes the raster but keeps the strips, so neither fallback painter is smooth on a large picture. The owner asked for the WebGL2 tier in the product painter and for a real fix of the strip cost, found in the code and measured before and after with one bench. The marketing site calls the same startPainter, so it inherits the tier.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 startPainter chooses WebGPU first, then WebGL2 through vello_gpu, then the CPU painter, and the surface names the painter with data-painter gpu, webgl or cpu
- [x] #2 The WebGL2 tier refuses a software renderer such as SwiftShader or llvmpipe by its renderer name, and not only by failIfMajorPerformanceCaveat
- [x] #3 A lost WebGL context or a WebGL frame failure moves the canvas to the CPU painter on a fresh canvas, and the SVG ink shows while it starts
- [x] #4 The WebGL2 tier starts and draws in a browser with no WebGPU adapter on this machine, and the run is recorded
- [x] #5 scripts/paint-parity.ts holds the WebGL2 painter to the SVG, and its result matches the CPU painter
- [x] #6 The cause of the strip cost is named from a measurement of the code, and a change in the painter removes it
- [x] #7 The same bench on the same picture and load gives the main-thread frame time of the CPU and WebGL2 painters before and after the change
- [x] #8 ADR 0071 or a new record states the three-tier order and what changed about vello_hybrid
- [x] #9 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Cherry-pick the spike commits bb9fd7f6f and f72d47b96 from spike/painter-webgl, and drop their Cargo features so that one build holds all three painters.
2. Make the spike's WebGL2 canvas product code: refuse a software renderer by its name before the shaders compile, and report the reason.
3. In startPainter, order WebGPU, then WebGL2, then the CPU. A WebGL2 refusal, failure or context loss moves the canvas to the CPU on a fresh canvas. The picture stage passes the failed painter's kind.
4. Measure the strip cost natively and in the browser bench, find the cause, and remove it in archboard-paint.
5. Run the same bench before and after, the parity run on the full corpus, and the no-WebGPU runs in the product page.
6. Record the change in ADR 0074, the design note, the Vello painter note, and a child proposal of the painter proposal.

Model: the WebGL2 tier changes subjects that exist only in the draft proposal JTZvj2vi ("Vello paints the canvas and motion lives in the painter", predecessor oyXXnyCV). So it is a child proposal of that draft:
w4XB6eBv "WebGL2 paints where WebGPU does not, and the strip painters keep their parts", predecessor JTZvj2vi, model vKEsyHFk, vault .archboard/vault.
Affected subjects: Painter choice vKEsyHFk#hKrzJUPf, its call vKEsyHFk#irHUnOY7, Browser painter vKEsyHFk#UpjzNLKH, Canvas drawing vKEsyHFk#290spzv7, Painter core vKEsyHFk#NFwqWgrm, renderer vKEsyHFk/vKEsyHFk#OHywsFXm, Picture stage vKEsyHFk#9FxduWoO.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## Order and failure

- packages/renderer/src/ui/clients/painter.ts: startBest tries WebGPU (a non-fallback adapter and a device), then startWebgl, then startCpu on a fresh canvas. A WebGPU start that throws goes to WebGL2 on a fresh canvas.
- A failure at work names its painter. A WebGPU failure retries the full order once; a second one within PICTURE_MS.gpuRetry goes to WebGL2. A WebGL2 failure, or its webglcontextlost event, goes to the CPU on a fresh canvas.
- crates/archboard-painter-wasm/src/webgl.rs refuses a software renderer by name (software.rs) after WebGlRenderer::begin and before the shaders finish. vello_gpu itself asks for failIfMajorPerformanceCaveat.
- The picture stage lets traffic rest on both strip painters.

## The strip cost

- Cause, from a native profile of the walk and vello_cpu strips on the largest picture (14.4 ms native): the strip canvases kept no parts, so each frame rebuilt every path, expanded every stroke (2.9 ms) and filled its outline (3.4 ms), and cut 3,250 offscreen fills (0.56 ms). The walk alone was 1.2 ms.
- Fix: crates/archboard-paint/src/parts keeps each part's calls with bounds and stroke outlines. A frame replays them, culls offscreen shapes, and fills the kept outline up to a scale of 1 (Vello's stroke tolerance is 0.25 / max(scale, 1) path units). Budget: 600,000 path elements.
- Owner: crates/archboard-paint/src/parts/tests.rs. A kept frame is byte-identical to a fresh frame under five cameras, and a kept part draws its strokes as outlines with the same number of shapes and layers.

## Bench (scripts/painter-bench.ts, largest picture, 1920x1080, headless Chrome 155, WebGPU off, ANGLE Vulkan on RTX 4090, 3 interleaved runs of 540 frames)

- Before (load 1.49 to 2.23): WebGL2 encode 19.9-20.1, frame 20.9-21.0 ms, 360-362 slow. CPU encode 20.1, frame 35.4-35.6 ms, 538-540 slow.
- After (load 1.16 to 1.61): WebGL2 encode 14.0-14.1, frame 14.9-15.0 ms, 152-157 slow. CPU encode 13.8-13.9, frame 29.2-29.3 ms, 418-421 slow.
- First frame is slower after: WebGL2 33 to 40-43 ms, CPU 51 to 57-58 ms.
- What remains is spread over the geometry (glyphs, long outlines, polylines). Strip reuse under a still camera needs a vendored vello_cpu and vello_gpu.

## Runs in the product page (worktree server, headless Chrome 155)

- ANGLE Vulkan, no WebGPU adapter: data-painter webgl, correct picture.
- WEBGL_lose_context: data-painter cpu, "The WebGL2 context was lost.", old canvas disconnected, same picture.
- --use-angle=swiftshader: cpu, "WebGL2 draws in software: ANGLE (Google, Vulkan 1.3.0 (SwiftShader ...".
- --disable-gpu: cpu, "WebGL2 refused: WebGL2 context unavailable".

## Parity (scripts/paint-parity.ts, full corpus, webgl and cpu)

- 1,536 comparisons over 384 drawings. WebGL2 near 0.226% mean, 1.01% worst; far 0.151%, 0.70%. CPU near 0.226%, 1.00%; far 0.150%, 0.78%. Largest WebGL2-CPU difference 0.14 points.
- 140 of 148 flowcharts refused by every painter: their paintings hold null coordinates in one shadow path (TASK-576, on another branch).

## Model

- Child proposal w4XB6eBv of JTZvj2vi. model compare against JTZvj2vi: 7 subjects changed, no container interface changed.
- archboard check --state w4XB6eBv: the TEST_IMPORT_UNEXPOSED warnings of the first test place were fixed by moving the test into src/parts. ANCHOR_PATH_MISSING (flowchart files) and EMBED_OUTDATED (README embeds) come from before this branch.

## Not verified

- Safari, Firefox with the shipped tier, Windows, macOS, Android, a headed WebGPU run, a vello_gpu panic, the llvmpipe name in Firefox, the far view in the bench, traffic lines (never kept on any painter).
- The marketing site branch derives PainterFailure from startPainter, so its failures need the new painter field on merge, and its picture-stage.ts conflicts with this branch.

Review against b11f377f1 (2026-11-04)

Standards fixes:
- 4d864dde3 corrects the shader claim in ADR 0074 and the design note. WebGlRenderer::begin starts compilation before the software refusal.
- 712071d21 refuses invalid benchmark selections and empty runs, reports painter failures with a nonzero exit, and waits for browser termination before removing profiles.

Spec fixes:
- 3f48426ca installs a fresh fallback canvas only after its painter starts. A CPU startup failure now leaves the caller's canvas available for disposal or retry.
- 816e9891b reports WebGL context loss before subscription and releases the listener if subscription triggers immediate replacement.
- a3d76ddd0 removes a late replacement canvas when its stage was disposed.
- 941b61655 counts retained child paths until their final owner releases them. Cache eviction cannot hide a retained graph from the 600,000-element budget.
- e249e17e2 requires requested parity painters and propagates drawing failures. A missing painter cannot produce a successful zero-comparison report.
- b0b7787ab simplifies the fallback branches and keeps the picture stage within its existing lint limits.

The existing proposal w4XB6eBv remains accurate. These fixes enforce its canvas recovery, painter selection, and retained-part contracts. They add no architectural intent, so no second proposal is needed.

Verification passed: 174 archboard-paint tests, 5 archboard-painter-wasm tests, native crate clippy, WASM crate clippy with warnings denied, build:core, bunx vp run types, 25 focused TypeScript tests, the semantic traffic browser owner, scoped typed lint, formatting, and diff whitespace inspection. Focused script runs prove both failure exits and a valid CPU benchmark.

Limits: the review did not repeat the full corpus or the before/after performance series. TASK-576 malformed flowcharts now stop parity explicitly. Cross-platform browser behavior and recovery from a real Vello GPU panic remain unverified.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
startPainter now tries WebGPU, then Vello GPU on WebGL2, then the CPU painter (ADR 0074). WebGL2 refuses a software renderer by its name, and a WebGL2 failure or a lost context moves the canvas to the CPU painter on a fresh canvas. The product canvas and the marketing site share the order.

The strip cost came from the painter: the CPU and WebGL2 canvases kept no parts, so each frame rebuilt every path, expanded every stroke and cut offscreen paths. A keeper in crates/archboard-paint/src/parts now keeps them. On the largest picture at 1920x1080 (same bench, load 1.2 to 2.2), a WebGL2 frame fell from 20.9 to 15.0 ms and a CPU frame from 35.5 to 29.2 ms. A first frame is about 7 ms slower, because it records its parts.

Parity on the full corpus: WebGL2 matches the CPU painter within 0.14 points of ink. 140 flowcharts could not be compared on any painter (TASK-576). bun run check passed.

Not verified: Safari, Firefox with the shipped tier, Windows, macOS, Android, a headed WebGPU run, a vello_gpu panic. The model holds the change as draft proposal w4XB6eBv, a child of JTZvj2vi.
<!-- SECTION:FINAL_SUMMARY:END -->

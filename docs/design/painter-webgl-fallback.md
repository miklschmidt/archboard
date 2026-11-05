# A WebGL fallback for the painter

This note measures the WebGL2 painter and the cost of its strips, and it records what shipped.
It serves [ADR 0074](../adr/0074-webgl2-paints-where-webgpu-does-not.md), [ADR 0071](../adr/0071-vello-paints-the-canvas-and-motion-lives-in-the-painter.md) and [the Vello painter](vello-painter.md). It reuses their fixture and their parity method.
A spike on the branch `spike/painter-webgl` measured the first version, in commits `bb9fd7f6f` and `f72d47b96`.
TASK-577 made that version product code and removed the cause of the strip cost.

## The answer

A page with no real WebGPU adapter now paints with Vello GPU on WebGL2, and the CPU painter comes after it.
The order lives in `startPainter` of `packages/renderer/src/ui/clients/painter.ts`, so the product canvas and the marketing site share it.

`vello_gpu` 0.3, the renamed `vello_hybrid`, draws the painter's `Canvas` on WebGL2 with the same calls as the CPU painter.
On the full corpus, its parity with the SVG matched the CPU painter's within 0.14 percentage points of ink on every comparison.

A frame of a strip painter has two parts. First the CPU cuts every path into sparse strips: rows of 4-pixel tiles with their coverage.
Then the strips are filled and composed: by a WebGL2 fragment pass in about 1 ms, or by the CPU raster in about 15 ms.
The largest picture of this repository holds 9,494 paths. At 1920 by 1080 its strips took 20 ms of main thread on both painters.

That cost came from the painter. The strip canvases kept no part between frames, so each frame built and cut every path again.
They now keep their parts as the WebGPU canvas does. On the same bench and the same load, the strips fell from 20.0 ms to 14.0 ms.
A WebGL2 frame fell from 20.9 ms to 15.0 ms, and a CPU frame from 35.5 ms to 29.2 ms.

The largest picture still gets no smooth motion on WebGL2. About 154 of 540 frames took over 25 ms.
On a small picture of 914 paths, the spike held 60 frames a second on both painters.

## What shipped

The spike's note set three conditions for the tier. Each one is met as follows:

1. The page refuses a software WebGL renderer itself. `crates/archboard-painter-wasm/src/software.rs` knows a software renderer by words that only its name holds: `swiftshader`, `llvmpipe`, `softpipe`, `lavapipe`, `basic render driver` and `software`.
2. The page treats `webglcontextlost` as it treats a lost WebGPU device. The CPU painter takes over on a fresh canvas.
3. The tier starts and draws in a browser with no WebGPU. The runs below were made on this Linux machine only. No run on Safari, Windows, macOS or Android was made.

These runs used the worktree's Archboard server and headless Chrome 155 on 2026-11-04. Each opened this repository's model in the product page.

| Chrome 155 with                                                      | `data-painter` | `data-painter-reason`                                                                                                                           |
| -------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| ANGLE on Vulkan on the RTX 4090, headless, so WebGPU gave no adapter | `webgl`        | WebGPU gave no adapter.                                                                                                                         |
| The same, then `WEBGL_lose_context.loseContext()`                    | `cpu`          | The WebGL2 context was lost.                                                                                                                    |
| `--use-angle=swiftshader --enable-unsafe-swiftshader`                | `cpu`          | WebGPU gave no adapter. WebGL2 draws in software: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver). |
| `--disable-gpu`                                                      | `cpu`          | WebGPU gave no adapter. WebGL2 refused: WebGL2 context unavailable                                                                              |

The WebGL2 picture was correct in a screenshot. After the context loss, the old canvas was out of the page, and the CPU painter drew the same picture.
The SwiftShader context came with no major performance caveat, so only the name refused it.
The Chrome 150 that `agent-browser` brings had no WebGL2 here, and it painted on the CPU.

## Why the strips cost 20 ms

### What a frame did

The GPU canvas of ADR 0071 keeps a settled part as an encoded scene, and a later frame draws it again with a new transform.
The walk asks every canvas to keep the same parts: settled items at the top level, and runs of text.
The CPU canvas answered that it keeps nothing, and the WebGL2 canvas of the spike did the same.
So each frame of a strip painter did all of this again:

- It walked the scene and built every path from the scene's geometry.
- It expanded each stroke into its outline. That outline does not depend on the camera up to a scale of 1.
- It cut the strips of every path, including the paths that lay outside the canvas.

### Where the time went

A native build of the walk and `vello_cpu`'s strips gave the shares of a frame of the largest picture at the bench's camera.
It ran in a scratch program that is not in the repository. Its frame took 14.4 ms against 20 ms in Chrome.

| Work                                        | Time    |
| ------------------------------------------- | ------- |
| The walk alone                              | 1.2 ms  |
| Stroke expansion                            | 2.9 ms  |
| The fill of the expanded outlines           | 3.4 ms  |
| 26 dashed lines with round caps, among them | 2.6 ms  |
| The glyphs, each filled as its own path     | 3.3 ms  |
| 3,250 fills outside the canvas              | 0.56 ms |

A prototype that kept the parts gave 8.2 ms. A second idea, to merge the runs of text into fewer parts, gave 8.42 ms and was dropped.

### The fix

`crates/archboard-paint/src/parts` holds a keeper that wraps any strip canvas.
While the walk draws a part, the keeper records its calls with their transforms and bounds. It also records the outline of each stroke.
A later frame replays the kept part under the new transform and skips each shape that lies outside the canvas.

Vello expands a stroke with a tolerance of 0.25 pixels, which is `0.25 / max(scale, 1)` path units.
So up to a scale of 1 the kept outline is the outline that Vello makes, and the frame fills it.
At a larger scale the frame strokes the path again.
The keeper clears its parts past 600,000 path elements, about 32 MB, as the GPU canvas clears its own.

`crates/archboard-paint/src/parts/tests.rs` owns the fix. A kept frame must give the same pixels as a frame drawn afresh, under five cameras.
Two of the cameras leave part of the picture outside the canvas, and one is above a scale of 1.
A second test counts the calls. A kept frame draws fewer strokes, and it draws the same number of shapes and layers.

### Before and after

The bench drew the largest picture at 1920 by 1080 in headless Chrome 155, with WebGPU off.
Each row holds three runs, and the painters took turns within each run. Each cell gives the range of the three runs.
Encode, render and frame are medians. The one-minute load was 1.49 to 2.23 before and 1.16 to 1.61 after.

| Painter | Build  | Encode          | Render          | Frame           | Frame, 90th percentile | Mean gap        | Frames over 25 ms | First frame     |
| ------- | ------ | --------------- | --------------- | --------------- | ---------------------- | --------------- | ----------------- | --------------- |
| WebGL2  | Before | 19.9 to 20.1 ms | 0.9 ms          | 20.9 to 21.0 ms | 22.3 to 22.4 ms        | 27.8 ms         | 360 to 362 of 540 | 33.2 to 33.3 ms |
| WebGL2  | After  | 14.0 to 14.1 ms | 0.9 ms          | 14.9 to 15.0 ms | 16.5 to 16.6 ms        | 21.4 to 21.5 ms | 152 to 157 of 540 | 40.2 to 42.9 ms |
| CPU     | Before | 20.1 ms         | 15.4 ms         | 35.4 to 35.6 ms | 37.2 to 37.5 ms        | 35.8 to 36.0 ms | 538 to 540 of 540 | 51.0 to 51.5 ms |
| CPU     | After  | 13.8 to 13.9 ms | 15.3 to 15.4 ms | 29.2 to 29.3 ms | 31.4 to 31.6 ms        | 29.6 to 29.7 ms | 418 to 421 of 540 | 57.2 to 58.4 ms |

The first frame got slower, because it records its parts and expands their strokes.
An earlier set of before runs, at a load of 3.4 to 29, gave a WebGL2 encode of 20.1 to 20.6 ms.

### What remains

After the fix, a native frame took 10.15 ms with the timers in place. No single waste remains, and the cost grows with the geometry:

| Work                       | Time    |
| -------------------------- | ------- |
| 38 long outlines           | 1.5 ms  |
| 3,399 glyphs on the canvas | 2.9 ms  |
| Polylines                  | 1.05 ms |
| Solid simple fills         | 1.58 ms |
| 1,055 gradient fills       | 0.62 ms |

In the product, the far view replaces this picture below a camera scale of 12/14 times the device pixel ratio. The bench sets that line to 0, so it measures the near view.
At the product's line, the native frame took 9.52 ms, with 2,993 glyphs.

Two further gains are possible, and neither is built:

- Keep the strips themselves while the camera stands still. `vello_cpu` 0.3 and `vello_gpu` 0.3 offer no interface for that, so it needs a vendored copy of each.
- Draw fewer paths, for example glyphs from an atlas.

A line that holds traffic changes each frame, so no painter keeps it. The fixture holds no traffic.

## Where WebGPU runs in November 2026

The table gives the stable channel on 2026-11-04. Each cell gives the first version with WebGPU on by default, and the condition for it.

| Browser                         | Windows          | macOS                                                                   | Linux                                                                       | Android                                                                                                   | iOS and iPadOS            |
| ------------------------------- | ---------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------- |
| Chrome, Edge and other Chromium | 113. ARM64: flag | 113                                                                     | Intel Gen12+ from 144. NVIDIA 535.183.01+ on Wayland from 147. Others: flag | 121 on Android 12+ with ARM, Qualcomm or Intel GPUs. Imagination on Android 16+ from 139. Others: not yet | WebKit, so as Safari      |
| Firefox                         | 141              | Apple Silicon only: 145 on macOS 26, 147 on every macOS. Intel Macs: no | No. Nightly only                                                            | No. Behind a flag                                                                                         | WebKit, so as Safari      |
| Safari                          | None             | 26, on macOS 26 Tahoe only. Safari 26 and 27 on older macOS: off        | None                                                                        | None                                                                                                      | 26, on iOS and iPadOS 26+ |
| Samsung Internet                | None             | None                                                                    | None                                                                        | caniuse marks 24+ as supported. No source gives its GPU limits                                            | None                      |

ChromeOS has WebGPU from Chrome 113.
Every browser on iOS runs WebKit, by guideline 2.5.6 of the App Store, except under the entitlements for the EU and Japan.
Firefox's release branch turns WebGPU on by default only on Windows and on Apple Silicon Macs.

A browser can also give no adapter on a machine that the table covers.
If "Use graphics acceleration when available" is off, Chrome gives no adapter. A blocklist or the command line can also turn WebGPU off.
Chrome's blocklist refuses Windows on Qualcomm unless a feature turns it on.

### What share of visitors has WebGPU

No source gives a trustworthy share of the general public.

| Source                       | Share with WebGPU         | What it counts                                                                                  |
| ---------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| web3dsurvey, read 2026-11-04 | 83.39%                    | Reports where WebGPU gave a working adapter, from sites for graphics developers. No date range. |
| caniuse, data of 2026-10-29  | 85.8% full, 3.66% partial | Browser versions only. It ignores the GPU and OS conditions above, so it is an upper bound.     |

web3dsurvey splits its share by platform: Windows 87.81%, macOS 90.81%, Linux 19.19%, Android 74.1%, iOS 86.42% and ChromeOS 93.19%.
Only 0.04% of its working adapters were fallback adapters.

### Where WebGL2 runs

WebGL2 runs in every current browser. web3dsurvey counts 98.05% overall and 88.85% on Linux, and caniuse counts 97.13% of usage.
web3dsurvey marks 3.62% of its WebGL2 reports with a major performance caveat.

These facts matter for a painter:

- From Chrome 139 on the desktop, Chrome Platform Status marks the automatic fallback to SwiftShader as deprecated. WebGL context creation fails instead.
- Firefox ignores `failIfMajorPerformanceCaveat`, because its pref `webgl.disable-fail-if-major-performance-caveat` is true by default.
- `EXT_color_buffer_float` makes RGBA16F renderable in WebGL2, and web3dsurvey counts it on 99.95% of WebGL2 reports.

Most visitors with no WebGPU use Linux, or Firefox outside Windows and Apple Silicon.
The rest use Safari before macOS 26 or iOS 26, or an Android device that a blocklist excludes.
Nearly all of them have WebGL2.

## The WebGL routes

The `Canvas` trait of `archboard-paint` asks for these operations:

- Fill a path with the non-zero or the even-odd rule, and stroke a path.
- Paint a solid colour or a peniko gradient under its own transform.
- Open a layer with a clip and an opacity.
- Open a layer that cuts (`DestOut`) or keeps (`DestIn`) what lies under it.

Dashes reach the canvas already cut into pieces, and glyphs and icons reach it as filled paths. The trait draws no images.
Two more operations are optional: keeping a drawn part for the next frame, and the lens.

| Route                                              | Version and licence                     | What it lacks for this painter                                                                                              | Verdict                        |
| -------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `vello_gpu` on its own WebGL2 backend              | 0.3.0 of 2026-10-02, Apache-2.0 OR MIT  | Kept parts and the lens. Mask layers panic, but the trait uses none.                                                        | Measured. Carries the painter. |
| `vello_gpu` on wgpu's WebGL2 backend               | 0.3.0 with wgpu 30, Apache-2.0 OR MIT   | The same, and wgpu's GL backend joins the WebAssembly. Upstream calls the native WebGL renderer better for speed and size.  | Not measured.                  |
| `vello` on wgpu's WebGL2 backend                   | 0.11.0 with wgpu 30                     | Everything. Vello needs compute shaders, and WebGL2 has none.                                                               | Not possible.                  |
| `vello_cpu` with a WebGL2 pass for upload and lens | 0.3.0, Apache-2.0 OR MIT                | Nothing, but the CPU still rasterizes every pixel. Only `putImageData` moves to the GPU.                                    | Not measured.                  |
| The browser's Canvas 2D                            | Built in                                | Group layers. `beginLayer` ships in no browser, so each layer needs an offscreen canvas. Its antialiasing is not Vello's.   | Not measured.                  |
| Skia CanvasKit                                     | 0.42.0 of 2026-08-18, BSD-3-Clause      | Nothing in the trait. It is a second Emscripten module of 7.3 MB, reached only through JavaScript, with its own rasterizer. | Not measured.                  |
| femtovg                                            | 0.28.0 of 2026-10-27, MIT OR Apache-2.0 | Its layers and path clips are a week old, and its clips use CPU masks. Its antialiasing is not Vello's.                     | Not measured.                  |

The keeper of `archboard-paint` gives the strip canvases the kept parts that `vello_gpu` and `vello_cpu` lack.

### `vello_gpu` on WebGL2

Linebender renamed `vello_hybrid` to `vello_gpu` in its Sparse Strips 0.3.0 release of 2026-10-02.
The CPU cuts each path into sparse strips. A WebGL2 fragment pass then fills and composes the strips.
Version 0.3 uses `vello_common` 0.3, as `vello_cpu` 0.3 does, and wgpu 30, as `vello` 0.11 does.
So the tier adds no second copy of peniko, kurbo or wgpu.

Every trait operation maps onto one call of its `Scene`, with the same arguments as on the CPU canvas.
The calls are `fill_path`, `stroke_path`, `set_paint` with `set_paint_transform`, and `push_layer` with a clip, an opacity or a blend mode.
`crates/archboard-painter-wasm/src/webgl.rs` holds the canvas and its target.
The target starts with `WebGlRenderer::begin`, which asks for a WebGL2 context with `failIfMajorPerformanceCaveat`. It renders into the canvas's own framebuffer.

Its README names the limits. "Mask layers, complex filter graphs as well as certain blend modes for non-isolated blending" panic.
Also, "Some failures panic instead of being reported through a user-facing error".
The painter opens every layer isolated, so a cut and a keep are supported blend layers. No reading of the parity run panicked.
The same README calls Vello GPU "slightly less mature than its CPU-only counterpart Vello CPU".
The README of the Vello repository at v0.11.0 calls the compute renderer "an experimental implementation".
It says that Vello GPU "is intended to become the primary renderer for production GPU use cases as it matures".

TASK-560 tried `vello_hybrid` on 2026-11-01 and left it out for four reasons. Two of them no longer hold:

- It was a third backend. That is still true.
- Its masks panicked. The painter uses no mask layers today.
- It pinned another wgpu and `vello_common`. Version 0.3 shares both.
- It was slower than Vello on WebGPU. That is still true, but a fallback competes with the CPU painter, not with WebGPU.

That run measured `vello_hybrid` on WebGL2 on the largest picture of the time, 6,292 paths. It gave an encode of 9 to 17 ms, a render of 2 to 10 ms, and 77 slow frames of 540.

### Why the other routes lose

`vello` cannot run on WebGL2 at all. wgpu reports WebGL2 as OpenGL ES 3.0, and it enables compute shaders and storage buffers only from ES 3.1.
The Vello README says that "Vello needs a GPU with support for compute shaders to run".

A WebGL2 pass over `vello_cpu` keeps the expensive half. The CPU painter spends its frame in two halves: the strips, and the raster with `putImageData`.
The upload pass removes only part of the second half.

Canvas 2D, CanvasKit and femtovg each bring a rasterizer that is not Vello's.
Each of them needs its own parity work against the SVG, and its own set of expected differences.
CanvasKit also adds 2,939,182 bytes after gzip, more than the whole painter adds today.

## How the WebGL2 painter fits the painter contract

The WebGL2 painter is one more `Canvas` behind the same `Stage`.
The stage computes every in-between, flight, passage, spark, far blend and traffic pulse in Rust, and it draws each frame through the trait.
So the far swap, the flights, the passages, the sparks and the traffic come out on WebGL2 as they come out on the CPU.
The picture stage lets traffic rest after a frame on both strip painters, as it did on the CPU painter.

| Part of the contract      | Vello on WebGPU                   | Vello GPU on WebGL2                         | Vello on the CPU                            |
| ------------------------- | --------------------------------- | ------------------------------------------- | ------------------------------------------- |
| Paths, strokes, gradients | Yes                               | Yes                                         | Yes                                         |
| Clips, opacity, cut, keep | Yes                               | Yes                                         | Yes                                         |
| Kept parts between frames | Yes, as encoded scenes            | Yes, as recorded calls with stroke outlines | Yes, as recorded calls with stroke outlines |
| The lens                  | Yes, six half-size levels in WGSL | No, so a move shows no blur                 | No, so a move shows no blur                 |
| Software renderer refused | `isFallbackAdapter`               | The caveat flag and the renderer's name     | Not needed                                  |

### The lens

ADR 0071 already accepts a painter with no lens. With the CPU painter, a machine with no WebGPU shows "the same moves with no blur".
The WebGL2 painter has no lens either. It shows the same moves as the CPU painter, and parity at rest does not change.

A port of the lens is possible, but nobody built it.
`vello_gpu` 0.3 renders only into the canvas's own framebuffer through its public interface.
So a port must first copy the frame into a texture with `blitFramebuffer`.
It then runs the six halving passes into RGBA16F textures, and the last pass back to the canvas.
RGBA16F needs `EXT_color_buffer_float`. The port is a hand translation of the 136 lines of `lens.wgsl` to GLSL ES 3.0.

### The choice of painter

The page chooses once for a canvas:

1. If WebGPU gives a non-fallback adapter and a device, Vello paints on WebGPU.
2. Otherwise the page starts `Painter.webgl`. It refuses a context with a major performance caveat, or one whose renderer draws in software. Otherwise Vello GPU paints.
3. Otherwise the CPU painter paints, on a fresh canvas.

A canvas that took a WebGL2 context takes no 2D context. So step 3 needs a fresh canvas, as a WebGPU failure does.
`data-painter` has the values `gpu`, `webgl` and `cpu`. `data-painter-reason` says why WebGPU and WebGL2 did not paint.

`failIfMajorPerformanceCaveat` alone does not keep a software renderer out:

- Firefox ignores it by default.
- Chrome 155 with `--use-angle=swiftshader --enable-unsafe-swiftshader` gave a context with no caveat. In the spike, Vello GPU then drew the largest picture at 933 ms a frame, the median of five frames.

So `Painter.webgl` also reads the renderer's name. When `WEBGL_debug_renderer_info` is there, it reads `UNMASKED_RENDERER_WEBGL`. Otherwise it reads `RENDERER`.
It reads the name once per page, from a context on a scratch canvas, before any canvas takes a context of its own.
A first version read the name from the canvas's own context, after Vello GPU had started to compile its shaders there.
Under SwiftShader in Chrome 155, that refusal cost 12 to 69 ms of main thread on every canvas.
Now the first refusal of a page costs 33 ms, and each later one less than 0.1 ms. On the RTX 4090 the probe adds about 4 ms to the first start.
Firefox reports a generalized renderer name, for example "NVIDIA GeForce GTX 980, or similar". Nobody made sure that its name for llvmpipe still says llvmpipe.

A recording keeps the CPU painter by the normal rule. Chrome 155 with `--disable-gpu` gave no WebGL2 context, and `Painter.webgl` refused.

### Failure while it draws

A WebGPU painter that fails at work gets one more try with the full order. A second failure within `PICTURE_MS.gpuRetry` sends the canvas to WebGL2.
A WebGL2 painter that fails in a frame gives way to the CPU painter.
The `vello_gpu` documentation warns that its methods can fail with no error after a context loss. So the page listens for `webglcontextlost` itself, and it moves to the CPU painter.
Each replacement takes a fresh canvas.

A panic is a second risk. The painter's module runs every painter, and a Rust panic in WebAssembly traps that module.
Nobody tested what a trap leaves in the module, or whether the CPU painter of the same module still draws after it.
If it does not, the SVG ink stays as the last fallback, as ADR 0071 states.

## Parity

At rest, the WebGL2 painter must match the SVG as the other painters do.
`scripts/paint-parity.ts` takes `--painters webgl`, so the existing method compares it at scale 1 (near) and in the far view at scale 0.5 (far).
The script reads the WebGL2 raster from its canvas in the task that drew it, before the browser presents it.

The run of 2026-11-04 compared the whole corpus with the WebGL2 painter and the CPU painter, in headless Chrome 155 on the RTX 4090.
The corpus held 524 drawings: 228 architecture pictures, 148 sequences and 148 flowcharts, in the dark and the light theme.
Every painter refused 140 of the flowcharts, because their paintings held `null` in place of numbers.
All of those numbers sat in one shadow path of a flowchart card. TASK-576 fixed that fault on `main` in #41.
The other 384 drawings gave 1,536 comparisons.

| Painter | Near, mean | Near, worst | Far, mean | Far, worst |
| ------- | ---------- | ----------- | --------- | ---------- |
| WebGL2  | 0.226%     | 1.01%       | 0.151%    | 0.70%      |
| CPU     | 0.226%     | 1.00%       | 0.150%    | 0.78%      |

The worst comparison of both painters is the whole model of this repository in the light theme, near.
The two painters differed by at most 0.14 percentage points of ink on any one comparison, and by 0.005 on average.
The light theme averaged 0.36% near and 0.24% far, and the dark theme 0.10% and 0.06%.

A second run compared the 148 flowcharts of a corpus rendered after #41, with no reading skipped. It gave 592 comparisons.

| Painter | Near, mean | Near, worst | Far, mean | Far, worst |
| ------- | ---------- | ----------- | --------- | ---------- |
| WebGL2  | 0.272%     | 0.89%       | 0.124%    | 0.55%      |
| CPU     | 0.270%     | 0.88%       | 0.120%    | 0.55%      |

On the flowcharts the two painters differed by at most 0.027 percentage points of ink on any one comparison.

In motion, the films of [the Vello painter](vello-painter.md) read each frame from the canvas on a held clock.
They work on a WebGL2 canvas the same way, but nobody filmed a move on it.

A WebGL2 canvas that the browser presented cannot be read back, because the painter asks for no preserved drawing buffer.
`drawImage` and `createImageBitmap` then give transparent pixels.
So `tests/system/browser/semantic-traffic.test.ts` compares screenshots of the canvas element, which work on every painter.

## Measurements

### How the runs were made

All runs used one machine: NixOS with Linux 6.18.56, an Intel Core i7-13700K with 24 threads, 62 GiB of memory, and an NVIDIA GeForce RTX 4090 with driver 595.104.02.
The browsers were Google Chrome 155.0.8059.79 and Firefox 158.0, both headless. On 2026-11-04 the stable channels were at Chrome 157 and Firefox 159.0.1.

- Chrome ran with `--headless=new`. The machine's `google-chrome` wrapper adds `--enable-features=Vulkan --use-angle=vulkan --disable-vulkan-surface` to a headless run. So WebGL2 ran on ANGLE over Vulkan on the RTX 4090.
- `--disable-features=WebGPUService` turned WebGPU off. `navigator.gpu` stays, but `requestAdapter` answers null. That is the page's case "WebGPU gave no adapter".
- Firefox ran with `--headless`. It named its WebGL renderer "NVIDIA GeForce GTX 980, or similar", its generalized name for this GPU. It has no `navigator.gpu` on Linux.

The runs are headless because a window opened on a workspace that was not on screen. Its page got no animation frames, and the run stopped.
Both headless browsers paced frames at 60 Hz, so a gap comes in steps of 16.7 ms.

`scripts/painter-bench.ts` serves the painter and one painting of the corpus. A fresh browser profile opens the page for each run.
The page paints the picture under a camera that zooms between the fit and 1.6 times the fit every 240 frames. The camera also pans by 15% of the canvas every 360 frames.
So every frame draws the whole picture again. After 30 frames of warm-up, the page records 540 frames.
Each row holds three runs, and the painters take turns within each run.

The page reads four times for each frame:

- Encode is the time of `Stage::draw` into the canvas: the walk over the scene and, for both strip painters, the strips.
- Render is the rest of `Painter.frame`. For WebGL2 it is the call that sends the strips and the draw calls to WebGL. For the CPU painter it is the raster and `putImageData`.
- Frame is `Painter.frame` as the page timed it.
- Gap is the time between two animation frames. As in the Vello painter note, a gap over 25 ms makes a slow frame.

Other sessions loaded the machine during part of the work, up to a load average of 36. Each result records the one-minute load average.
In the spike, a set of runs at a load of 14 to 18 gave a WebGL2 encode of 26.4 to 27.4 ms. At a low load it took 20.4 ms. So load moved these numbers by a third.
Firefox reported encode and render in whole milliseconds.

Two pictures of the corpus served as fixtures, both with the blocks engine in the dark theme:

- The largest is the whole model of this repository, 3,786 by 2,160 units. A frame of it draws 8,518 fills, 976 strokes and 207 layers. Its scene holds 10,050 glyphs in 448 runs, and the painter fills each glyph as its own path.
- The small one is the whole model of `examples/web-shop`, 1,002 by 691 units. A frame of it draws 897 fills, 17 strokes and 3 layers.

The table under [Before and after](#before-and-after) holds the runs of TASK-577. The tables below come from the spike, before the kept parts.

### The spike: the largest picture at 1920 by 1080

Each cell gives the range of the three runs. Encode, render and frame are medians.

| Browser     | Painter | Encode          | Render  | Frame           | Frame, 90th percentile | Mean gap        | Frames over 25 ms |
| ----------- | ------- | --------------- | ------- | --------------- | ---------------------- | --------------- | ----------------- |
| Chrome 155  | WebGL2  | 20.2 to 20.5 ms | 1.0 ms  | 21.2 to 21.5 ms | 22.5 to 23.3 ms        | 25.1 to 25.5 ms | 51% to 53%        |
| Chrome 155  | CPU     | 20.3 to 20.4 ms | 15.6 ms | 35.8 to 35.9 ms | 38.0 to 38.3 ms        | 36.4 to 36.5 ms | 100%              |
| Firefox 158 | WebGL2  | 19 ms           | 2 ms    | 21 ms           | 23 ms                  | 23.9 to 24.2 ms | 44% to 45%        |
| Firefox 158 | CPU     | 19 to 20 ms     | 14 ms   | 33 to 34 ms     | 35 ms                  | 33.2 to 33.6 ms | 97%               |

A separate run read one pixel back after each WebGL2 frame, so its render held the GPU's work.
In Chrome at a load of 2.8, that render took 3.2 ms at the median and 6.1 ms at the 90th percentile.

### The spike: the size of the canvas

These runs used Chrome 155 with WebGPU off, on the largest picture. The values are medians.
The 3840 by 2160 row holds three runs at a load of 2.3 to 11.1. The 7680 by 2050 row holds one run at a load of 1.6.
7680 by 2050 is the canvas of the owner's window, 6144 by 1640 CSS pixels at a device pixel ratio of 1.25.

| Canvas       | WebGL2 encode   | WebGL2 render | WebGL2 frame    | CPU encode      | CPU render      | CPU frame       |
| ------------ | --------------- | ------------- | --------------- | --------------- | --------------- | --------------- |
| 1920 by 1080 | 20.2 to 20.5 ms | 1.0 ms        | 21.2 to 21.5 ms | 20.3 to 20.4 ms | 15.6 ms         | 35.8 to 35.9 ms |
| 3840 by 2160 | 27.3 to 27.7 ms | 1.5 to 1.6 ms | 29.0 to 29.4 ms | 27.1 to 27.2 ms | 41.7 to 41.8 ms | 68.5 to 68.9 ms |
| 7680 by 2050 | 29.6 ms         | 1.7 ms        | 31.4 ms         | 28.9 ms         | 51.0 ms         | 80.9 ms         |

The strips grow slowly with the canvas, and the CPU raster grows fast. With the GPU wait at 3840 by 2160, the WebGL2 render took 5.4 ms.

### The spike: the small picture at 1920 by 1080

These runs used a load of 8.6 to 12.9 in Chrome, and 4.3 to 5.9 in Firefox. The values are medians.

| Browser     | Painter | Encode        | Render        | Frame         | Mean gap | Frames over 25 ms |
| ----------- | ------- | ------------- | ------------- | ------------- | -------- | ----------------- |
| Chrome 155  | WebGL2  | 3.1 to 4.9 ms | 0.3 ms        | 3.4 to 5.3 ms | 16.7 ms  | 0 of 540          |
| Chrome 155  | CPU     | 3.1 to 3.5 ms | 4.2 to 5.7 ms | 7.6 to 9.4 ms | 16.7 ms  | 0 to 1 of 540     |
| Firefox 158 | WebGL2  | 3 ms          | 1 ms          | 4 ms          | 16.7 ms  | 0 to 2 of 540     |
| Firefox 158 | CPU     | 3 to 4 ms     | 4 to 5 ms     | 7 to 9 ms     | 16.7 ms  | 0 of 540          |

### WebGPU, for reference

Headless Chrome 155 with WebGPU on drew the largest picture in 1.9 to 2.2 ms a frame at 1920 by 1080. At 3840 by 2160 it took 2.0 to 2.1 ms, and no frame was slow.
ADR 0071 records that a headless WebGPU canvas on this machine drew blank once. These times hold for the main thread only, because nobody looked at those frames.
A first headed run of 60 frames gave a mean gap of 8.3 ms at 120 Hz, with no slow frame.

### Start

`Painter.webgl` takes 20 to 21 ms to start in Chrome, because it compiles its shaders at once, and the first start of a page reads the renderer's name. It took 17 to 19 ms before the probe. In the spike, Firefox took 36 to 56 ms.
The CPU painter starts in 2.8 to 3.7 ms.

## What it costs

### WebAssembly size

The painter's WebAssembly, as `bun run build:core` builds it with all three painters, is 5,198,113 bytes raw and 1,654,151 bytes after gzip -9.
The build of `main` that the spike measured was 4,869,087 bytes raw.
The spike measured each tier with `cargo build --release` for `wasm32-unknown-unknown` and `wasm-bindgen --target web`, and no `wasm-opt`. Its builds held 18,931 bytes of timing calls more than `main`.

| Tiers in the spike's build | Raw         | gzip -9     | Brotli 11   |
| -------------------------- | ----------- | ----------- | ----------- |
| WebGPU, WebGL2 and CPU     | 5,156,581 B | 1,638,562 B | 1,170,027 B |
| WebGPU and CPU             | 4,888,018 B | 1,560,620 B | 1,110,945 B |
| WebGL2 and CPU             | 3,477,617 B | 1,214,710 B | 910,559 B   |
| CPU only                   | 3,198,629 B | 1,130,805 B | 851,751 B   |

The WebGL2 tier added 268,563 bytes raw and 77,942 bytes after gzip in the spike.
Vello on WebGPU costs 1,689,389 bytes raw and 429,815 bytes after gzip.

### Build

`Cargo.lock` gains 56 packages. Four reach the WebAssembly: `vello_gpu`, `vello_gpu_shaders`, and new versions of `bit-set` and `bit-vec`.
The other 52 run only in the build. They compile the WESL shaders to GLSL: `wesl`, `lalrpop`, `logos`, `regex`, `petgraph` and their dependencies.
Every new package is under MIT, Apache-2.0 or the Unlicense.
No new tool joins the dev shell, and `bun run build:core` builds the tier with no change to `scripts/build-core.ts`.
Each of the gate's four Cargo builds compiles these packages, and the hosted runner caches no Rust build.
On it, the Rust phase of the gate took 16.5 minutes against 8.5 minutes on `main`. So the gate's time limit rose from 30 to 45 minutes.

### Risks

- `vello_gpu` is young. Its README names panics for unsupported features and for some failures. A panic traps the module that holds every painter.
- A software renderer whose name holds none of the known words gets through, and it draws at about a second a frame.
- A third painter is one more painter to hold to the SVG and to the browser owners.
- Nobody measured WebGL2 on Safari, on Windows or on Android. The `vello_gpu` changelog names fixes for Safari 15, Intel GPUs and Apple Silicon, so faults happened there before.
- The strips take the main thread. A slow CPU loses more time than a slow GPU on this painter.

## How to reproduce

Run these steps from the repository root, inside `nix develop`. A fresh worktree first needs `bun install` and `bun run build`.

```sh
bun run build:core
bun scripts/render-corpus.ts render /tmp/corpus --engines blocks --variants current \
  --comparison off --themes light,dark --svg
```

On this machine, `google-chrome` adds its Vulkan flags to a headless run. Make a wrapper that starts it headless:

```sh
printf '#!/bin/sh\nexec google-chrome --headless=new --window-size=1920,1080 "$@"\n' > /tmp/chrome-headless
chmod +x /tmp/chrome-headless
```

Time the painters and compare them with the SVG:

```sh
bun scripts/painter-bench.ts /tmp/corpus /tmp/bench --only "(whole model) | blocks | dark" \
  --painters webgl,cpu --sizes 1920x1080 --runs 3 --browser /tmp/chrome-headless \
  --flags=--disable-features=WebGPUService
bun scripts/paint-parity.ts /tmp/corpus /tmp/parity --painters webgl,cpu \
  --browser /tmp/chrome-headless
```

To time an older build of the painter, build it in its own checkout and pass `--core <dir>` with the directory that holds its `archboard_painter_wasm.js`.
`--sizes` takes a list such as `1920x1080,3840x2160`.
Each run writes one JSON file with its environment, its load, and the mean, median, 90th, 99th percentile and longest value of each time.
Run on an idle machine, because load moved these numbers by a third.

## What this note did not measure

- Any browser on Windows, macOS, Android or iOS, and Safari at all.
- Firefox with the shipped tier. Firefox ran only in the spike.
- Any GPU but the RTX 4090, and any CPU but the Core i7-13700K. A slower CPU makes the strips slower.
- A headed run with a real WebGPU adapter on the shipped tier.
- The WebGL2 and CPU painters at 120 Hz. The headless browsers paced frames at 60 Hz.
- A WebGL2 lens, and any motion but the camera: no flight, entrance or traffic. The fixture holds no traffic.
- The far view in the bench, which sets the far line to 0.
- Strips kept under a still camera, and a glyph atlas.
- `vello_gpu` on wgpu's WebGL backend, a WebGL pass over `vello_cpu`, Canvas 2D, CanvasKit, femtovg, and `vello_cpu` with threads.
- What a `vello_gpu` panic leaves in the module.
- Whether Firefox's renderer name reveals llvmpipe.
- A share of the general public with WebGPU.

## Sources

Each source gives its own date, or the date this note read it.

- GPU for the Web, [Implementation Status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status), edited 2026-10-02.
- Chrome for Developers, [What's New in WebGPU (Chrome 144)](https://developer.chrome.com/blog/new-in-webgpu-144), 2026-01-07.
- Chrome for Developers, [Chrome moves to a two-week release cycle](https://developer.chrome.com/blog/chrome-two-week-release), 2026-03-03.
- Chrome for Developers, [WebGPU troubleshooting tips and fixes](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips), updated 2025-10-17.
- [Chromium Dash](https://chromiumdash.appspot.com/), read 2026-11-04: Chrome 157.0.8103.38 stable on Linux on 2026-11-03.
- Chrome Platform Status, [Remove SwiftShader fallback](https://chromestatus.com/feature/5166674414927872), desktop 139, updated 2026-02-10.
- Chromium, `gpu/config/webgpu_blocklist_impl.cc` on `main`, read 2026-11-04.
- Chrome Platform Status, [Add BeginLayer/EndLayer](https://chromestatus.com/feature/5629802309484544), in development, read 2026-11-04.
- Mozilla, [Firefox 147.0 release notes](https://www.firefox.com/en-US/firefox/147.0/releasenotes/), 2026-01-13.
- Mozilla, [StaticPrefList.yaml on the release branch](https://github.com/mozilla-firefox/firefox/blob/release/modules/libpref/init/StaticPrefList.yaml), version 160.0, read 2026-11-04: `dom.webgpu.enabled` and `webgl.disable-fail-if-major-performance-caveat`.
- Mozilla, [product details](https://product-details.mozilla.org/1.0/firefox_versions.json), read 2026-11-04: Firefox 159.0.1.
- caniuse, [webgpu.json](https://github.com/Fyrd/caniuse/blob/main/features-json/webgpu.json) and [webgl2.json](https://github.com/Fyrd/caniuse/blob/main/features-json/webgl2.json), data of 2026-10-29.
- web3dsurvey, [WebGPU](https://web3dsurvey.com/webgpu) and [WebGL2](https://web3dsurvey.com/webgl2), undated, read 2026-11-04.
- Apple, [App Store Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), guideline 2.5.6, read 2026-11-04.
- Linebender, [Sparse Strips v0.3.0](https://github.com/linebender/vello/releases/tag/sparse-strips-v0.3.0), 2026-10-02.
- Linebender, [README of Vello at v0.11.0](https://github.com/linebender/vello/blob/v0.11.0/README.md), 2026-10-02, and the README of [`vello_gpu` 0.3.0](https://crates.io/crates/vello_gpu/0.3.0).
- Linebender, [`vello_gpu` examples](https://github.com/linebender/vello/tree/main/vello_gpu/examples), with `native_webgl` and `wgpu_webgl`, read 2026-11-04.
- gfx-rs, [`wgpu-hal/src/gles/adapter.rs` at v30.0.1](https://github.com/gfx-rs/wgpu/blob/v30.0.1/wgpu-hal/src/gles/adapter.rs).
- npm, [canvaskit-wasm 0.42.0](https://www.npmjs.com/package/canvaskit-wasm), 2026-08-18. The spike measured `bin/canvaskit.wasm` in its package: 7,317,345 bytes raw and 2,939,182 bytes after gzip -9.
- crates.io, [femtovg 0.28.0](https://crates.io/crates/femtovg), 2026-10-27.
- TASK-560, its notes of 2026-11-01 on `vello_hybrid`, SwiftShader and the choice of painter.

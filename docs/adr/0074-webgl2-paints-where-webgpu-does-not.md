---
status: accepted
---

# WebGL2 paints where WebGPU does not, and the strip painters keep their parts

The owner decided this on 2026-11-04 (TASK-577). This record replaces two clauses of
[ADR 0071](0071-vello-paints-the-canvas-and-motion-lives-in-the-painter.md).
The first is its rule for the choice of painter: "Otherwise `vello_cpu` paints."
The second is "`vello_hybrid` is not used."
[The WebGL fallback](../design/painter-webgl-fallback.md) holds the measurements and the method.

## Context

ADR 0071 sent every browser with no real WebGPU adapter to Vello on the CPU.
That covers most visitors on Linux, Firefox outside Windows and Apple Silicon, Safari before macOS 26, and Android devices that a blocklist excludes.
Nearly all of them have WebGL2.

`vello_gpu` 0.3 is the renamed `vello_hybrid`. It draws the same `Canvas` calls on WebGL2.
Two of the reasons of ADR 0071 against it no longer hold. It now shares wgpu and `vello_common` with the other painters, and the painter uses no mask layer.
A spike on 2026-11-04 showed that it removes the CPU raster, which took 15.4 ms a frame on the largest picture.

Both strip painters still spent about 20 ms of main thread per frame on that picture: 9,494 paths at 1920 by 1080.
A strip painter cuts each path into sparse strips (rows of small tiles with their coverage) on the CPU.
The cost came from the painter, not from Vello. The strip canvases kept no part between frames.
So every frame walked the scene again, built every path again and expanded every stroke into its outline again.
It also cut paths that lay outside the canvas.

## Decision

### The order of painters

The page chooses once for a canvas, from what the browser says:

1. If WebGPU gives a non-fallback adapter and a device, Vello paints on WebGPU.
2. Otherwise the page starts Vello GPU on the canvas's WebGL2 context. It refuses a context with a major performance caveat. It also refuses a renderer whose name says that it draws in software, for example SwiftShader or llvmpipe.
3. Otherwise Vello paints on the CPU, on a fresh canvas.

The refusal by name is necessary. Chrome gave SwiftShader with no performance caveat, and Firefox ignores the caveat flag.
When the browser gives `WEBGL_debug_renderer_info`, the name comes from it. Otherwise it comes from the plain renderer name.
The page reads the name once, from a context on a scratch canvas, before any canvas takes a context of its own.
So a refusal compiles no shader, and every later canvas of the page gets the same answer at once.
The rule reads no frame back, as before.

The order lives in `startPainter` of `@archboard/renderer`.
Every page that paints through it gets the same order, the product canvas and the marketing site alike.

### Failure while it draws

A WebGPU painter that fails at work gets one more try with the full order.
A second failure within `PICTURE_MS.gpuRetry` sends the canvas to WebGL2.
A WebGL2 painter that fails at work, or that loses its context, gives way to the CPU painter.
Vello GPU does not report a lost context, and its calls then draw nothing with no error. So the page listens for `webglcontextlost` itself.

Each replacement takes a fresh canvas, because a canvas that held a WebGPU or a WebGL2 context never takes a 2D one.
If the CPU painter fails, the SVG keeps the picture visible, as ADR 0071 states.

The surface says which painter draws: `data-painter` is `gpu`, `webgl` or `cpu`.
`data-painter-reason` says why WebGPU does not paint and, on the CPU, why WebGL2 does not either.

### The strip painters keep their parts

`crates/archboard-paint/src/parts` keeps for both strip canvases what the WebGPU canvas already kept.
The walk keeps the same parts on every painter: settled items at the top level, and runs of text.
A kept part is the list of its drawing calls, with their transforms and bounds, and with the outline of each stroke.

A frame replays the kept parts and skips each shape that lies outside the canvas.
Vello expands a stroke into its outline with a tolerance of 0.25 pixels.
Up to a scale of 1, that tolerance is 0.25 path units. So the kept outline is the outline that Vello makes, and the frame fills it.
At a larger scale the frame strokes the path again.
The keeper clears its parts past 600,000 path elements, about 32 MB, as the WebGPU canvas clears its own.

### One build holds every painter

The painter's WebAssembly holds all three painters, with no Cargo feature.
`vello_gpu` is a plain dependency of `archboard-painter-wasm`.

## Consequences

- The runs drew the largest picture at 1920 by 1080 in headless Chrome 155 on an RTX 4090. A WebGL2 frame fell from 20.9 ms to 15.0 ms of main thread. Its frames over 25 ms fell from 361 to 154 of 540.
- On the same runs, a CPU frame fell from 35.5 ms to 29.2 ms. Its frames over 25 ms fell from 539 to 419 of 540.
- A first frame now records its parts, so it takes longer: 40 to 43 ms against 33 ms on WebGL2, and 57 to 58 ms against 51 ms on the CPU.
- On the full corpus, flowcharts included, WebGL2 matched the CPU painter against the SVG. On no comparison did the two differ by more than 0.14 percentage points of ink.
- A strip frame still costs about 14 ms on that picture. The walk, the glyphs, the long outlines and the polylines share that time, and no single waste remains. Strips kept under a still camera need an interface that `vello_cpu` and `vello_gpu` do not offer.
- A line that holds traffic changes each frame, so no painter keeps it.
- A WebGL2 painter has no lens, so a move on it shows no blur, as on the CPU.
- WebGL2 starts in 20 to 21 ms, because it compiles its shaders, and the first start of a page also reads the renderer's name.
- The painter's WebAssembly is 5,198,113 bytes raw and 1,654,151 bytes after gzip.
- A Rust panic in `vello_gpu` traps the module that holds every painter. This change did not test what a trap leaves. The SVG ink stays as the last fallback.
- Recordings and README takes keep the CPU painter, because `--disable-gpu` gives no WebGL2 context.
- Nobody ran the tier on Safari, Firefox, Windows, macOS or Android. The note names what ran on Linux.

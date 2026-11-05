---
status: accepted
---

# WebGL2 paints where WebGPU does not, and the strip painters keep their parts

The owner decided this on 2026-11-04 (TASK-577). This record replaces two clauses of
[ADR 0071](0071-vello-paints-the-canvas-and-motion-lives-in-the-painter.md).
The first is its rule that `vello_cpu` paints every browser with no real WebGPU adapter.
The second is its clause that `vello_hybrid` is not used.
[The WebGL fallback](../design/painter-webgl-fallback.md) holds the measurements, the method and the code that carries this decision.

## Context

ADR 0071 sent every browser with no real WebGPU adapter to Vello on the CPU.
That covers most visitors on Linux, Firefox outside Windows and Apple Silicon, Safari before macOS 26, and Android devices that a blocklist excludes.
Nearly all of them have WebGL2.

Vello GPU is the renamed Vello Hybrid. It takes the same drawing calls as the CPU painter, and it fills them on WebGL2.
Two of the reasons of ADR 0071 against it no longer hold. It now shares its graphics libraries with the other painters, and the painter uses no mask layer.
A spike showed that it removes the CPU raster, the pass that fills every pixel of a frame on the main thread.

Both strip painters still dropped frames on the largest picture of this repository.
During a camera move, most frames came late on WebGL2 and nearly all came late on the CPU.
A strip painter cuts each path into sparse strips (rows of small tiles with their coverage) on the CPU.
The cost came from the painter, not from Vello. The strip painters kept no part between frames.
So every frame walked the scene again, built every path again and expanded every stroke into its outline again.
It also cut paths that lay outside the canvas.

## Decision

### The order of painters

The page chooses once for a canvas, from what the browser says:

1. If WebGPU gives a non-fallback adapter and a device, Vello paints on WebGPU.
2. Otherwise Vello GPU paints on the canvas's WebGL2 context. The page refuses a context with a major performance caveat. It also refuses a renderer whose name says that it draws in software, for example SwiftShader or llvmpipe.
3. Otherwise Vello paints on the CPU, on a fresh canvas.

The refusal by name is necessary. Chrome gave SwiftShader with no performance caveat, and Firefox ignores the caveat flag.
On SwiftShader, Vello GPU took about a second for a frame of the largest picture.
The name is the unmasked renderer name where the browser gives it, and the plain renderer name otherwise.
The page reads the name once, before any canvas takes a context of its own.
So a refusal costs a canvas no shader work, and every later canvas of the page gets the same answer at once.
The rule reads no frame back, as before.

Every page that paints a picture gets the same order, the product canvas and the marketing site alike.

### Failure while it draws

A WebGPU painter that fails at work gets one more try with the full order.
A second failure soon after sends the canvas to WebGL2.
A WebGL2 painter that fails at work, or that loses its context, gives way to the CPU painter.
Vello GPU does not report a lost context, and it then draws nothing with no error. So the page listens for the context loss itself.

Each replacement takes a fresh canvas, because a canvas that held a WebGPU or a WebGL2 context never takes a 2D one.
If the CPU painter fails, the SVG keeps the picture visible, as ADR 0071 states.

The surface says which painter draws: WebGPU, WebGL2 or the CPU.
It also says why WebGPU does not paint and, on the CPU, why WebGL2 does not either.

### The strip painters keep their parts

Both strip painters keep parts, as the WebGPU painter already did.
The walk keeps the same parts on every painter: settled items at the top level, and runs of text.
A kept part is the list of its drawing calls, with their transforms and bounds, and with the outline of each stroke.

A frame replays the kept parts and skips each shape that lies outside the canvas.
Up to a scale of 1, Vello makes the same outline of a stroke at every scale. So up to that scale, the frame fills the kept outline.
At a larger scale the frame strokes the path again.
A kept frame gives the same pixels as a frame drawn afresh.
The kept parts have a memory budget. Past it, the painter clears them, as the WebGPU painter clears its own.

### One build holds every painter

The painter's WebAssembly holds all three painters, and no build leaves one out.
The page chooses its painter in the browser, so every page needs every painter.

## Considered and rejected

- Vello on WebGL2. Vello needs compute shaders, and WebGL2 has none.
- Vello GPU through the WebGL2 backend of wgpu. It adds a second GL layer to the painter's WebAssembly, and the Vello maintainers call the native WebGL2 renderer better for speed and size.
- The CPU painter with a WebGL2 pass that only shows its pixels. The CPU still cuts and fills every path, so the larger cost stays.
- The browser's Canvas 2D, Skia CanvasKit and femtovg. Each brings a rasterizer that is not Vello's, so each needs its own parity work against the SVG. Canvas 2D has no group layers in any browser, and CanvasKit is a second large module.
- Strips kept while the camera stands still. Vello GPU and Vello CPU offer no interface for that, so it needs a maintained copy of each.
- Runs of text merged into fewer parts. A prototype was slower than kept parts alone.

## Consequences

- A strip frame of the largest picture costs clearly less on both painters, and fewer frames come late. That picture still gets no smooth motion on WebGL2, and a small picture moves smoothly on both strip painters.
- A first frame takes longer, because it records its parts.
- On the full corpus, flowcharts included, WebGL2 matched the CPU painter against the SVG.
- A strip frame still spends its time on the walk, the glyphs, the long outlines and the polylines, and no single waste remains.
- A line that holds traffic changes each frame, so no painter keeps it.
- A WebGL2 painter has no lens, so a move on it shows no blur, as on the CPU.
- WebGL2 starts more slowly than the CPU painter. It compiles its shaders at its start.
- The painter's WebAssembly grows by the WebGL2 painter, and every page loads it.
- A Rust panic in Vello GPU stops the module that holds every painter. This change did not test what such a stop leaves. The SVG ink stays as the last fallback.
- Recordings and README takes keep the CPU painter, because a browser with its GPU turned off gives no WebGL2 context.
- Nobody ran the tier on Safari, Firefox, Windows, macOS or Android. The note names what ran on Linux.

---
status: accepted
---

# Vello paints the board canvas, and motion lives in the painter

The owner decided this on 2026-11-01 (TASK-560). This record replaces one clause of
[ADR 0059](0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md):
"The browser viewer keeps its classes and Web Animations over that SVG."

This record also changes how three earlier decisions are carried out, but not what they decide.
[ADR 0027](0027-explicit-traffic-controls-distance-based-animation.md) keeps its pulse,
[ADR 0041](0041-a-recording-is-a-talk-rendered-frame-by-frame.md) keeps its frame clock, and
[ADR 0042](0042-the-picture-answers-the-hand-and-a-card-opens-by-flight.md) keeps its flights.
[The Vello painter](../design/vello-painter.md) holds the measurements and the method.

## Context

A pane showed a server-drawn SVG, and all motion was DOM work. A picture change edited
thousands of SVG attributes per frame, and a flight of a large board dropped frames.
The typed scene of ADR 0059 lets a frontend paint with no SVG or CSS.
Vello is written in Rust, so it joins the Cargo workspace.
It can paint the same scene in the browser through WebAssembly and in a native GPUI frontend.
PixiJS can do neither.

Nobody had measured Vello in the browsers that people use. So a real run came first.
The run used Chrome 155 on Linux with an RTX 4090 and a board of 6,292 paths.
Vello on WebGPU encoded a frame in 4.2 ms and rendered it in 1.0 ms.
One frame of 540 took more than 25 ms.
Vello on the CPU took 9 to 16 ms to encode and 11 to 17 ms to raster.
About two frames of three took more than 25 ms.
WebGPU on a software adapter took more than 8 s per frame. Firefox 158 on Linux has no WebGPU. Safari, Windows and macOS were not
measured.

## Decision

### One painter contract

A painter takes a scene and its presentation state, and one frame comes out. The
presentation state is the camera, the lit set, the recede, the far blend and the marks.
`archboard-paint` holds this contract and draws through one `Canvas` trait, so `vello`
on the GPU and `vello_cpu` on the CPU run the same code. `archboard-painter-wasm` holds
what only a browser has.

### A transition is a pure function

`Between` takes scene A, scene B and a progress value, and gives an in-between list of
items. It pairs groups by subject id and mixes typed geometry, opacity and transforms.
The entrance, the departure, the far swap and the dive follow the same rule. All of them
run with no GPU and no DOM, and the Rust tests own them. The durations stay in
`@archboard/timing`, and the page hands them to the painter.

### The page keeps the decisions, and the stage keeps the motion

The page decides which arrival a picture gets and how far the shared cards moved.
It also decides when a flight lands. `PictureStage` hands those decisions to the painter and asks for
frames from the frame clock only while something moves. The DOM motion modules are
gone, so the viewer has one motion system.

### The painter is chosen once, from what the browser says

If `requestAdapter({ powerPreference: "high-performance" })` gives a non-fallback
adapter and a device, `vello` paints. Otherwise `vello_cpu` paints. The rule reads no
frame back, because a blank-frame check also hides a missing adapter.
If the GPU fails at start or in a frame, the CPU painter takes over on a fresh canvas.
A canvas that held a WebGPU context never takes a 2D one.

The surface says which painter drew: `data-painter` is `gpu` or `cpu`, and
`data-painter-reason` says why the GPU does not paint. `vello_hybrid` is not used. It
was a third backend, its masks panicked, and it was slower than Vello on the GPU.

### The SVG stays in the page as the semantic layer

The surface keeps the same `drawing.svg`, and CSS hides its ink once a painter has drawn.
Search, copy, screen readers, the marks and the keyboard keep working.
A painted surface drops the SVG's glyphs and definitions, because they were half of a new
picture's layout. Its traffic is taken out before it enters the page, so no SMIL runs
under the canvas.

A first picture's ink waits up to `PICTURE_MS.painterGrace` for its painter, so that the
painter brings the picture in. A late or failed painter leaves a correct board, because
the ink then shows.

A pointer lands on the canvas, because the surface takes no pointer. The painter
answers what lies under it from the scene, in the order it draws, with flow heads where
it holds them. An event that reached a group of the picture came from no pointer.
A click from assistive technology is an example, and it names its own group.

### Recordings paint on the CPU

A recording page runs with `--disable-gpu`, so the normal rule chooses `vello_cpu`. A
frame then depends on nothing but the talk and the frame clock. A frame waits for the
painter to start. The SVG stays the product of an export, a PNG and a README asset.

## Consequences

- On the largest board at 120 Hz, a toggle's mean frame gap fell from 31.6 ms to 9.1 ms,
  and its slow frames from 68 to 10. Wheel, pinch, keys and drag have no slow frames.
- A person without WebGPU sees a correct board on the CPU painter, but with slower
  frames. Traffic there rests as long as its last frame took. On a small board it takes
  21% of the main thread, against 8% on the old page.
- The painter adds 4.2 MB of WebAssembly, and the page loads it apart from the core.
  The page asks for the GPU while it draws a first picture, because a browser's first
  answer takes about 350 ms.
- README takes run with `--disable-gpu`, so they paint on the CPU. They did not run again
  with this change.
- The page holds a canvas and an SVG. TASK-561 follows this change to reduce the DOM.
- Headless Chromium with a GPU adapter draws a blank canvas in the runs of 2026-11-01.
  So GPU parity and frame measurements run in a browser with a window. The notes of
  TASK-560 hold the facts.

---
status: accepted
---

# Vello paints the board canvas, and motion lives in the painter

The owner decided this on 2026-11-01 (TASK-560). This record replaces one clause of
[ADR 0059](0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md).
The clause is "The browser viewer keeps its classes and Web Animations over that SVG."

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
An in-between is also a scene, so a picture that arrives during a flight starts from
what shows. Nothing lands first.

### A move is a rack of focus

The owner tested the first painter and said: "These are just the same as it were before."
The first climb repaired the old choreography and kept it. So motion is now designed for the GPU.

A lens runs between Vello and the surface while a picture moves.
It halves the frame six times, and it shows the frame sharp in one rounded box and out of focus around it.
The stage says what the box is on each frame, and the same box serves every move.
A flight holds the card, a door holds its growing frame, and an entrance holds a circle that opens from the middle.
A frame at rest never meets the lens, so parity at rest holds and a picture at rest costs nothing more.
The CPU painter has no lens, so a recording and a machine with no WebGPU show the same moves with no blur.

A picture blooms out of its middle, and a card that the last picture also drew flies from where it stood.
The board inside a card blooms as the camera flies in, and it gathers again on the way back.
The parts of a door ride inside the door as it grows, so no frame travels empty.
A subject id is one identity across boards, and this is what lets a door on one board fly to its place on the next.

### The page keeps the decisions, and the stage keeps the motion

The page decides which arrival a picture gets and how far the shared cards moved.
It also sets the moment of landing for a flight. `PictureStage` hands those decisions to the painter and asks for
frames from the frame clock only while something moves. The DOM motion modules are
gone, so the viewer has one motion system.

### The painter is chosen once, from what the browser says

If `requestAdapter({ powerPreference: "high-performance" })` gives a non-fallback
adapter and a device, `vello` paints. Otherwise `vello_cpu` paints. The rule reads no
frame back, because a blank-frame check also hides a missing adapter.
If the GPU fails at start or in a frame, the CPU painter takes over on a fresh canvas.
A canvas that held a WebGPU context never takes a 2D one.
The stage releases each failed painter and restores complete SVG ink while its replacement starts.
If the CPU painter fails, the SVG keeps the board visible.

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

- On the largest board at 120 Hz, a toggle's mean frame gap fell from 31.6 ms to 9.2 ms,
  and its slow frames from 68 to 11. Wheel, pinch, keys and drag have no slow frames.
- A person without WebGPU sees a correct board on the CPU painter, but with slower
  frames. Traffic there rests as long as its last frame took. On a small board it takes
  21% of the main thread, against 8% on the old page.
- The painter adds 4.2 MB of WebAssembly, and the page loads it apart from the core.
  The page asks for the GPU while it draws a first picture, because a browser's first
  answer takes about 350 ms.
- README takes run with `--disable-gpu`, so they paint on the CPU. They did not run again
  with this change.
- The page holds a canvas and an SVG. TASK-561 follows this change to reduce the DOM.
- Vello fills fixed buffers for each frame and reports nothing when one is full, so a
  large board on a large canvas stops drawing with no error. `crates/vendor/vello_encoding`
  raises two of those limits for 48 MB more GPU memory, and no test owns the budget.
- On the measured Linux machine, headless Chromium with a GPU adapter drew a blank canvas on 2026-11-01.
  The owner states that there is no fix for this.
  So GPU parity and frame measurements run in a browser with a window. The notes of
  TASK-560 hold the facts. TASK-562 read frames from the WebGPU swap texture in headless
  Chrome on the same machine, and those frames are correct.

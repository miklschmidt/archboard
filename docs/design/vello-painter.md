# The Vello painter

This note holds the measurements and the structure behind
[ADR 0071](../adr/0071-vello-paints-the-board-canvas-and-motion-lives-in-the-painter.md).
Read the ADR for the decision. Read this note before you change a painter, a move or the choice of painter.

## Where the code is

| Place                                                                    | What it owns                                                                                  |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `crates/archboard-paint`                                                 | The `Canvas` trait, the walk over a scene, the palette, picking, and all motion as pure Rust. |
| `crates/archboard-paint/src/between`                                     | One scene turning into the next, the entrance and the departure.                              |
| `crates/archboard-paint/src/stage`                                       | One canvas's picture and all that a frame of it needs.                                        |
| `crates/archboard-painter-wasm`                                          | The `Painter` class that a page holds, and `vello` on WebGPU.                                 |
| `packages/renderer/src/ui/clients/painter.ts`                            | The choice of painter.                                                                        |
| `apps/web/src/ui/clients/semantic-board-canvas/picture/picture-stage.ts` | One surface's stage. It tells the painter what the page says, and it asks for frames.         |
| `apps/web/src/ui/clients/semantic-board-canvas/picture/picture-ink.ts`   | A first picture's ink, held back for a moment while its painter starts.                       |

`vello` and `vello_cpu` share peniko and kurbo, so one `Canvas` trait serves both.

## What the SVG gave for free

| The SVG gave                             | The painter gives                                                                                |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Hit testing                              | `Targets` in `pick.rs`, under the rules of SVG `pointer-events`, in the order the painter draws. |
| CSS classes for the light and the recede | `Presentation` and the fades of `Stage::set_light`.                                              |
| CSS far view                             | `Stage::set_far`, a blend from 0 to 1 over `FAR_VIEW_SWAP_MS`.                                   |
| `:hover` on a control                    | The stage's own `pointermove` listener and `setHoveredToggle`.                                   |
| Search, copy and screen readers          | The SVG, which stays in the page under the canvas with its ink hidden.                           |
| SMIL traffic                             | `TrafficClock` and `traffic.rs`, on the frame clock.                                             |

## How to compare the painters with the SVG

`scripts/paint-parity.ts` draws each corpus reading three ways in one real browser.
It compares each painter with the SVG at scale 1 and in the far view at scale 0.5.
If a pixel has a match within one step on the other raster, it counts as the same.
A match is within 0.1 of its colour, in the perceptual measure of pixelmatch.
The share is the different pixels over the pixels with ink.

The script reads a painter's raster from its canvas in the frame it drew. A screenshot
of a canvas under an emulated size is resampled, and this looks like a half-pixel shift.

```sh
bun scripts/render-corpus.ts render /tmp/corpus --engines blocks --variants current \
  --comparison off --themes light,dark --svg
bun scripts/paint-parity.ts /tmp/corpus /tmp/parity --worst 40
```

## Parity at the gate

The corpus holds 528 readings of the blocks engine in both themes, near and far, for each painter.
The first run stopped at its time limit after 332 readings and kept only its rasters at 1% or more.
Three far readings in the light theme reached 1%, with both painters.
The other 196 readings gave 784 comparisons. Their three batches averaged 0.30%, 0.30% and 0.33%, and the worst was 1.34%.
Traffic on the largest board differed by 0.10% to 0.28%.
All the differences that were looked at are antialiasing of small words at half scale.

Real screenshots at 1920x1080 held the rest: a line crossing, the slab look, a picked line and the tip.
A real pointer on a grid of 64 points gave the same answer on 64 at two zooms, and on 61 at the fit zoom.
Those three points lie less than a pixel past the edge of a line's halo.

The grid found one real fault. A shape with its own `pointer-events` took the pointer in a surface with `pointer-events: none`, so no pick ran.
Now nothing inside a painted surface takes the pointer, and `canonical-model-gestures.test.ts` owns that.
At deep zoom, screenshots of the old page showed no recede, although its classes asked for one. The painter draws it at every zoom.
The cause on the old page is not known.

## Parity on the final build

A full run on the final build compared all 528 readings, which gave 2112 comparisons.

| Painter | Near, mean | Near, worst | Far, mean | Far, worst |
| ------- | ---------- | ----------- | --------- | ---------- |
| GPU     | 0.23%      | 0.65%       | 0.41%     | 1.14%      |
| CPU     | 0.22%      | 0.62%       | 0.41%     | 1.16%      |

The light theme averaged 0.33% near and 0.61% far. The dark theme averaged 0.11% and 0.22%.
Eight comparisons reached 1%, and all eight are far readings in the light theme. None reached 2%.
The worst diffs are antialiasing of small words and line tips at half scale, and no shape moved.

Traffic on the largest board differed by 0.09% to 0.27%.

The door fix came after this run and after the frame measurements below. It changed layout and no painter code, and nobody measured these numbers again.
TASK-562 changed the painter after this run, and [Parity on the current painter](#parity-on-the-current-painter) holds the later numbers.

## Parity on the current painter

The TASK-562 build compared all 528 readings near and far, which gave 2112 comparisons in headless Chrome on the same NVIDIA adapter.
The run read each GPU frame from the WebGPU swap texture, through a lab copy of `scripts/paint-parity.ts`. It did not compare traffic.

| Painter | Near, mean | Near, worst | Far, mean | Far, worst |
| ------- | ---------- | ----------- | --------- | ---------- |
| GPU     | 0.20%      | 0.76%       | 0.12%     | 0.73%      |
| CPU     | 0.19%      | 0.75%       | 0.11%     | 0.78%      |

The light theme averaged 0.31% near and 0.19% far. The dark theme averaged 0.08% and 0.05%.
No comparison reached 1%.

## The hill climb

The method is TASK-405's: real Chrome 155 over CDP with real input, an rAF recorder, long tasks, and the median of 3 runs.
The board is the largest in this repository, 3646 by 2117 units, on an RTX 4090 at 120 Hz. A slow frame takes over 25 ms.
Each round changed one thing and compared numbers and captured frames with the round before.

| Moment | Mean gap, old page | Mean gap, painter | Longest gap, old page | Longest gap, painter | Slow, old page | Slow, painter |
| ------ | ------------------ | ----------------- | --------------------- | -------------------- | -------------- | ------------- |
| Wheel  | 8.54 ms            | 8.35 ms           | 66.7 ms               | 16.7 ms              | 1              | 0             |
| Pinch  | 8.65 ms            | 8.33 ms           | 58.3 ms               | 9.2 ms               | 2              | 0             |
| Keys   | 8.47 ms            | 8.33 ms           | 16.7 ms               | 8.8 ms               | 0              | 0             |
| Drag   | 9.63 ms            | 8.33 ms           | 66.7 ms               | 9.6 ms               | 2              | 0             |
| Idle   | 8.57 ms            | 8.35 ms           | 16.8 ms               | 16.6 ms              | 0              | 0             |
| Open   | 9.70 ms            | 8.41 ms           | 141.6 ms              | 33.4 ms              | 7              | 1             |
| Toggle | 31.63 ms           | 9.15 ms           | 750.0 ms              | 150.1 ms             | 68             | 11            |
| Dive   | 14.42 ms           | 8.75 ms           | 350.0 ms              | 83.4 ms              | 58             | 9             |

Long tasks in a toggle fell from 4431 ms to 559 ms, and in a dive from 2563 ms to 195 ms.
Both columns ran on the same copy of the vault with a load under 5. The painter column is the final build, after the rebase onto `main`.

### What the rounds changed

| Round         | Change                                                                                       | What it gave                                                                                                       |
| ------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Thin SVG      | A painted surface drops its glyphs and definitions.                                          | Toggle long tasks 1847 to 575 ms. Dive 1650 to 298 ms.                                                             |
| Flight clock  | A flight starts with its first drawn frame.                                                  | A picture no longer jumps into the middle of its flight. Frames rose, so the slow count rose until the next round. |
| Kept parts    | The GPU canvas keeps still items and each run of words.                                      | Toggle 95th percentile 25 to 16.6 ms.                                                                              |
| Glide         | A camera glide tells the stage each frame.                                                   | The fit key, a toggle's camera and a walkthrough step no longer cut.                                               |
| Definitions   | A flight knows what the next scene defines inside its body.                                  | Pills and arrowheads no longer pop in at landing.                                                                  |
| Dashes        | A dashed path is cut into straight pieces first.                                             | Toggle 95th percentile 16.6 to 8.4 ms. kurbo measured each curve to one part in a million.                         |
| First picture | The page asks for the GPU while it draws, and the ink waits up to `PICTURE_MS.painterGrace`. | A reload has its entrance, and the far view shows no fade from near words.                                         |
| Time          | A frame takes the later of its stamp and the last change.                                    | A long task in a frame's turn no longer draws the old camera with the new picture.                                 |
| Own light     | A leaving picture keeps its last look, and an entering one stands in its light at once.      | A walkthrough step no longer lifts the veil for its first 200 ms.                                                  |
| Veil          | Traffic on an unlit line recedes twice, as it did through the line's mask.                   | A walkthrough step shows no pulses on what it is not about.                                                        |
| CPU traffic   | Traffic on the CPU painter rests as long as its last frame took.                             | See below.                                                                                                         |

### What the first pass got wrong

The tables above ran at 1920x1080 under emulation, and the first pass judged each moment against the old page.
Both were wrong. The real window is 6144 by 1640 CSS pixels at a device pixel ratio of 1.25, so its canvas holds 13.3 million pixels.
That size showed a black first load, a frozen first scroll and a dive that stood still, and 1920x1080 hid all three.
The brief asked for the best motion that the GPU painter can give, so the old page is no measure of it.
TASK-562 did the pass again, and the two sections below replace the claims of the first pass.

## Vello's fixed buffers

Vello 0.11 fills fixed buffers for each frame. A path costs tiles for its whole box inside the clip and the viewport, so the cost grows with zoom and canvas size.
The table gives the tiles of one still picture of 32 cards and 83 lines on the 13.3 million pixel canvas.
The default limit is 2.1 million tiles. Traffic comes on top of these numbers.

| Zoom | Tiles     |
| ---- | --------- |
| 1    | 858,000   |
| 1.2  | 1,100,000 |
| 2    | 1,890,000 |
| 4    | 2,480,000 |
| 8    | 2,900,000 |

If a buffer fills, Vello skips the raster and reports no error. Before the first frame, the canvas shows nothing. After it, the canvas keeps its last frame while the frame loop and its submits go on.
A measure of frame gaps cannot see that fault, so read the picture itself.
`crates/vendor/vello_encoding` raises `tiles` to `1 << 22` and `ptcl` to `1 << 24`, for 48 MB more GPU memory.
A see-through layer also clips to what it holds, because a layer the size of the canvas costs tiles for all of it.
No test owns this budget. A board that fills these buffers stops drawing, with no error.

## The climb at the real window

Each round filmed one moment on a large board at the real canvas size and changed one thing.
A film holds the page's clock, steps it by one frame, and reads the frame that the painter drew. So it has no timing noise, and a look at the frames decides each round.
The first films ran in a private headless sway at 7680x2160. Later films ran in headless Chrome on the same NVIDIA adapter, and they read each frame from the WebGPU swap texture, because that browser shows no WebGPU canvas in a screenshot.
Both labs show 60 Hz at most, so their frame gaps count only as long gaps. No run measured 120 Hz at this canvas size.

| Moment                    | What the film showed                                                                             | Change                                                                                                                                                 | Result                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| First load                | A black canvas, then the whole picture at once.                                                  | One GPU starts as the page boots and finishes a first frame on a canvas nobody sees. A canvas is transparent until its first frame lands.              | The entrance plays in order with no black.                                               |
| Entrance                  | Shadows and junction marks stood at full strength on an empty board.                             | Each shadow comes in with what casts it.                                                                                                               | Nothing stands before its owner.                                                         |
| First scroll              | The canvas held its last frame from the first wheel notch, at scale 1.06 up to 8.                | The Vello buffers above.                                                                                                                               | The wheel draws at every scale up to 8.                                                  |
| Pan and zoom              | Traffic held still during a camera move.                                                         | The hold is gone.                                                                                                                                      | Traffic runs through every camera move.                                                  |
| Near and far              | The swap waited for the camera to rest, so a zoom ended in a second change.                      | The stage watches the camera it draws and starts the swap at the crossing.                                                                             | The swap happens during the zoom.                                                        |
| A door opens              | Everything moved at once, and a large toggle read as a tangle.                                   | A staged flight: a card starts gently, a line that travels far recedes and returns, a label that crosses leaves and returns, and pulses ride the line. | The cards stay easy to follow, and the landing pop fell from 3157 changed pixels to 159. |
| A double line in flight   | It lost its core and drew as a solid band.                                                       | Each line has a mask for each frame.                                                                                                                   | The core travels with the line.                                                          |
| Click on a door           | Nothing moved for 250 to 600 ms while the next picture was laid out.                             | The picture steps back at once. The picture is drawn ahead while the reader rests on the card.                                                         | A rested door takes off 109 to 163 ms after the click, against 390 to 780 ms.            |
| Dive                      | The camera stood still for 600 ms and cut, and the board shrank by a fifth at landing.           | The Vello buffers above. A glide uses the flight's curve, and a flight ends at the fit where the pane lands.                                           | The inset stands exactly where the board lands.                                          |
| Takeover                  | The old hover light dimmed every card for one frame.                                             | A picture that takes the stage over has no last light.                                                                                                 | No change at takeover.                                                                   |
| The way back              | The board shrank alone on an empty stage for 300 ms.                                             | Each fade of a dive follows the camera's place on the path, not the clock.                                                                             | The board settles into its card, and the parent comes up around it.                      |
| A picture during a flight | The board jumped to the last picture and set off again, with 52,467 changed pixels in one frame. | The next flight starts from the in-between, and following a picture stops a glide where it is drawn.                                                   | The frame changes 15,238 pixels, the same as its neighbors.                              |

At the real canvas size the painter takes 3.6 to 4 ms of main thread for a frame at the median and 5.2 to 6.3 ms at the 90th percentile.
From submit to done takes 7.4 to 7.6 ms at the median and 10.4 to 11 ms at the 90th percentile. Each frame submits twice, for the render and for the blit.

### What the last pass covered

The last pass filmed these moments at the real canvas size on the final painter:

- A first load, a door that opens, and a picture that arrives during that flight.
- A dive, the way back, and the takeover at the end of each.
- A pointer's rest, a pick with its sweep, and the recede.
- The fit key, the arrow keys, a drag, a wheel in and out, and a pinch, each through the far view where it reaches it.
- Opening a sequence, the departure of the last picture, and a change from one flow to another.
- A walkthrough step, on the small model of `captureCanonicalWalkthrough`, because a copy of a vault outside Git has no retained walkthrough.
- A door and a dive with `prefers-reduced-motion`, where each is one cut and no pulse shows.

This pass says nothing about the light theme or about any moment at 120 Hz, because it filmed neither.

These things stay after the pass, and each one has a reason:

- A new picture is drawn on the main thread, which stalls it for about 90 ms just before a flight on a large board. Pulses and the step back stop for that time. A move of that draw to a worker is a decision for the owner.
- A door that the reader did not rest on waits for layout, with the step back as its answer.
- The words of a card fade out and return during a flight that turned around, because the in-between holds no words that match the next picture.
- The pulses of a sequence stop for a flight and start again when it lands.
- A flight takes 640 ms at any distance, inside the band that the note on `PICTURE_MS.transition` in `@archboard/timing` gives. This pass tested no longer flight.
- A first load starts about 150 ms later than on the old page, because the ink waits for the painter.
- A receded line keeps its arrowhead.

### The CPU painter

On the largest board the CPU painter gives a mean gap of 11.2 ms at idle and 21.5 ms on the wheel.
In a toggle the mean gap is 23.4 ms, and in a dive it is 12.4 ms.
Traffic alone used to take the whole thread, with a mean gap of 24.7 ms. It now rests after each frame for as long as that frame took.
On a small board the painter takes 21% of the main thread with traffic running, against 8% on the old page.
A quarter of the frame goes to the gradient tables of `vello_common`, which it builds again each frame.

In the Firefox 158 runs on Linux on 2026-11-01, the browser exposed no WebGPU, so it took the CPU painter.
It drew the largest board correctly at 1920x1080.
The table holds two runs of each page. The SVG column is the page before this change, with its DOM motion.
Slow share is the part of the frames that took over 25 ms.

| Moment | Mean gap, CPU painter | Mean gap, SVG | Longest gap, CPU painter | Longest gap, SVG | Slow share, CPU painter | Slow share, SVG |
| ------ | --------------------- | ------------- | ------------------------ | ---------------- | ----------------------- | --------------- |
| Idle   | 13.1 ms               | 8.4 ms        | 63 ms                    | 17 ms            | 14%                     | 0%              |
| Toggle | 22.7 ms               | 20.2 ms       | 138 ms                   | 517 ms           | 33%                     | 14%             |
| Wheel  | 22.9 ms               | 16.7 ms       | 67 ms                    | 373 ms           | 34%                     | 10%             |

The old SVG page had shorter mean frame gaps at idle and on the wheel, but higher maximum gaps during input.
These runs did not measure the current SVG fallback.
That fallback cuts between pictures because this change deleted the DOM motion. The CPU painter keeps all motion.

A failed painter releases its resources and restores the SVG glyphs and definitions.
The stage hides the failed canvas while a replacement starts.
If the CPU painter also fails, the surface keeps complete ink.
React owns the canvas host, and the stage owns each canvas inside it.

## The motion designed for the GPU

The owner tested the climb above and said: "These are just the same as it were before." They also said: "I expected some polished magic here."
The climb repaired faults and kept the old choreography, so its last pass does not mean that the motion is finished.
This pass threw the old choreography away where a GPU can do better. It keeps the camera path, the durations and the identity of each subject.

The thesis is one material: focus. A reader goes somewhere, and that place stays sharp while the rest falls away.
The focal moment is a card that opens into its board. Every other move is a quieter use of the same lens.

| Moment                      | Before                                                                | Now                                                                                                                      |
| --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| A flight into a card        | A zoom, with a finished small picture faded in inside the card.       | The card holds focus, and the board round it blurs and sinks. The parts of the next board bloom out of the middle.       |
| The way back                | The same zoom, run backward, on an empty stage for a moment.          | The parts gather into the card, and the board above rises into focus round it.                                           |
| A move to a deeper board    | The picture faded, and the next came in by reading order.             | The camera flies through the nearest card that holds it. With no card, or no picture yet, the two boards zoom in as one. |
| A move to a shallower board | The picture faded, and the next came in by reading order.             | The camera flies out of the card that held this board. With no such card, the two boards zoom out as one.                |
| A move at the same depth    | The picture faded, and the next came in by reading order.             | The two boards travel sideways together, in the order of the tree, with a smear along the way.                           |
| A view of the same board    | The picture faded, and the next came in by reading order.             | The picture racks out of focus. The next blooms sharp from its middle, and shared subjects fly through the blur.         |
| A first load                | Frames, then cards down the board, then lines, then all labels.       | A wave leaves the middle: cards, then lines with light at their heads, then each label as its line reaches it.           |
| A door opens                | The frame grew empty, the lines dropped out, and the parts came late. | The parts ride inside the door at its scale, the door holds focus, and the lines stay visible under a slight blur.       |
| A door closes               | The parts faded where they stood.                                     | The parts ride back into the door.                                                                                       |

### The module tree decides the move

The owner tested the rack of focus and said: "If navigating on the same depth i want to be "transported" sideways. If navigating to a deeper module, i would expect it to zoom into the target. Navigating upwards in depth should zoom out to arrive at the target etc."

`departureTo` in `apps/web/src/ui/rules/architecture-model/scene.ts` compares the depth of the two scopes, and this alone gives the way. A move to a scope at the same depth gets a side from the order of the module tree, so one board always stands to the same side of another.

A passage (`crates/archboard-paint/src/passage.rs`) is a move between boards with no flight. Two rigid planes run on one timeline with one number for the place on the way, so they cannot drift apart. The click starts the passage with a small first step, and the place runs on from that step when the next picture arrives.

| Way      | The board left                         | The next board                                  | The lens                                   |
| -------- | -------------------------------------- | ----------------------------------------------- | ------------------------------------------ |
| Sideways | Leaves past the edge of the canvas.    | Comes in from the other edge at the same speed. | A smear as long as the speed of the frame. |
| In       | Grows about the card and fades.        | Grows out of the card, from far inside.         | The next board holds focus.                |
| Out      | Shrinks and fades, and stays in focus. | Settles from round the reader.                  | The next board comes into focus last.      |

The strip of boards is as short as the widest board lets it be. The next board is in sight before the last has gone, and no frame in the middle of the move is empty. The boards stand 8 percent further apart than the edge of the canvas needs, so the slow end of the move leaves nothing at the edge.

### What the lens costs

The lens takes no measurable frame time. A flight on the large board at 6144x1725 CSS pixels, DPR 1.25, gave these numbers in headless Chrome at 60 Hz.

| Build               | Median submit to done | 90th percentile | Frames over 25 ms |
| ------------------- | --------------------- | --------------- | ----------------- |
| Old flight          | 10.1 to 10.9 ms       | 19.1 to 23 ms   | 6                 |
| New flight, no lens | 11.3 to 11.9 ms       | 18.5 to 19.1 ms | 6                 |
| New flight, lens    | 11.7 to 13.8 ms       | 18.5 to 19.3 ms | 6                 |

The same few long frames appear in all three builds, near the start of a flight. They are not new, and this pass did not find their cause.
The levels of the lens take about 35 MB of GPU memory on a canvas of 13 megapixels. The page allocates them with the first frame that uses the lens.

### What this pass covered

This pass filmed each of these on the held clock and looked at the frames: a flight in, the way back, a sidebar move into a child, a move between siblings, a first load and a door that opens.
It also filmed a flight and a first load on the light ground.
It filmed a sidebar move and a flight with `prefers-reduced-motion`, and a sidebar move was one cut with no blur.

The pass over the depth moves filmed these moves in the repository's own model and looked at the frames: a sidebar move sideways at each of two depths, a flight in and out from the sidebar, a zoom in and a zoom out with no flight, a zoom into a card with the wait for a flight set to 0, and a sideways move with `prefers-reduced-motion`, which was one cut.
No film ran at 120 Hz. The stepped films run at 60 frames a second.

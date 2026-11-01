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

## Parity after the hill climb

A full run after the hill climb compared all 528 readings, which gave 2112 comparisons.

| Painter | Near, mean | Near, worst | Far, mean | Far, worst |
| ------- | ---------- | ----------- | --------- | ---------- |
| GPU     | 0.23%      | 0.65%       | 0.41%     | 1.34%      |
| CPU     | 0.22%      | 0.62%       | 0.42%     | 1.30%      |

The light theme averaged 0.33% near and 0.61% far. The dark theme averaged 0.11% and 0.22%.
Ten comparisons reached 1%, and all ten are far readings in the light theme. None reached 2%.
The worst diff is antialiasing of small words at half scale, and no shape differs.

This run came before the last fixes to light and traffic. A still corpus picture has no veil, so those fixes change none of these numbers.
Traffic on the largest board ran again after those fixes, and it differed by 0.09% to 0.26%.

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

### What the last pass covered

The last pass ran on the final build. It captured frames on both pages at the same moments, and each sheet put the painter above the old page.
It covered 12 moments:

- A toggle on a middle board and on the largest board.
- A dive, the way back, and opening a leaf.
- A first load, a breadcrumb, and opening a sequence.
- A pointer's rest with its light, recede and tip.
- The fit key, a zoom through the far view, and a walkthrough step.

The pass found nothing left to improve at the level of the painter.
The pass before it also covered a flowchart entrance, traffic in motion, and a rest in the far view. They match the old page.
With `prefers-reduced-motion`, two screenshots 700 ms apart were the same, no ink waited, and a toggle produced 4 frames.

The walkthrough step is on the example model's recorded tour, because a copy of a vault outside Git has no retained walkthrough.
No pass judged the width of a sweep in the far view at close range.

Four things stay, by choice:

- A toggle pauses for 100 to 150 ms before its flight on the largest board. About a third of that is layout of the hidden SVG, which TASK-561 can remove.
- A pill that opens into a container grows as a large colored box while it crosses to the container's look. The old page does the same.
- A first load starts about 150 ms later than on the old page, because the ink waits for the painter. The reader sees the entrance in exchange.
- A receded line keeps its arrowhead. On the old page the head vanishes under a veil.

### The CPU painter

On the largest board the CPU painter gives a mean gap of 11.2 ms at idle and 21.5 ms on the wheel.
In a toggle the mean gap is 23.4 ms, and in a dive it is 12.4 ms.
Traffic alone used to take the whole thread, with a mean gap of 24.7 ms. It now rests after each frame for as long as that frame took.
On a small board the painter takes 21% of the main thread with traffic running, against 8% on the old page.
A quarter of the frame goes to the gradient tables of `vello_common`, which it builds again each frame.

A failed painter releases its resources and restores the SVG glyphs and definitions.
The stage hides the failed canvas while a replacement starts.
The surface keeps complete ink if the CPU painter also fails.
React owns the canvas host, and the stage owns each canvas inside it.

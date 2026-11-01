# The Vello painter

This note holds the measurements and the structure behind
[ADR 0071](../adr/0071-vello-paints-the-board-canvas-and-motion-lives-in-the-painter.md).
Read the ADR for the decision. Read this note before you change a painter, a move or the choice of painter.

## Where the code is

| Place                                                                    | What it owns                                                                                  |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `crates/archboard-paint`                                                 | The `Canvas` trait, the walk over a scene, the palette, picking, and all motion as pure Rust. |
| `crates/archboard-paint/src/between`                                     | One scene turning into the next, the entrance and the departure.                              |
| `crates/archboard-paint/src/stage.rs`                                    | One canvas's picture and all that a frame of it needs.                                        |
| `crates/archboard-painter-wasm`                                          | The `Painter` class that a page holds, and `vello` on WebGPU.                                 |
| `packages/renderer/src/ui/clients/painter.ts`                            | The choice of painter.                                                                        |
| `apps/web/src/ui/clients/semantic-board-canvas/picture/picture-stage.ts` | One surface's stage. It tells the painter what the page says, and it asks for frames.         |

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
The old page drew no recede at deep zoom, although its classes asked for one. The painter draws it at every zoom.

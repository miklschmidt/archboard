---
status: accepted
---

# The stage keeps its clock and takes the page's decisions whole

The owner's advisors decided this on 2026-11-19 (TASK-653.18, the archboard-deepen run). It says
how [ADR 0071](0071-vello-paints-the-canvas-and-motion-lives-in-the-painter.md) is carried out,
not what it decides: the page keeps the decisions, and the stage keeps the motion. It keeps the
kept parts of [ADR 0074](0074-webgl2-paints-where-webgpu-does-not.md).

## Context

The stage had 29 names, most of them setters that the page called one by one. The page set the
phases and the longest step after it started a painter, and a painter that missed them flew
nothing. The WebAssembly painter held the stage's clock beside the stage and read it at ten
calls. The strip canvases kept their parts in a wrapper that the WebAssembly painter held, and a
bench and a parity script reached two counters of the stage that no page used.

## Decision

- **The stage is seven names.** `Stage::new(theme, size, Pace)`, `present(Presentation)`,
  `arrive(Painting, Arrival)`, `depart(Departure)`, `draw(Surface, now) -> Motion` and `pick`.
  A presentation states only what changed: each value it states replaces the last, and a value
  it leaves out stays. An arrival is a cut, a carry, an entrance or a flight into a card. A
  departure is a leaving, a stay, a clear or the end of a flight into a card.
- **The stage owns its clock, and reads it where the page names a moment.** A timed value carries
  its own moment: the camera, the awaited step, the light, a sweep, an entrance, a flight into a
  card and a leaving. The stage reads its clock once for each such moment and once for each
  frame, which are the moments the WebAssembly painter read before. A cut, a carry, a stay, a
  clear and a sweep with no lines name no moment and read nothing, because a read between two
  frames splits a stall and changes the time. Reading one moment twice changes nothing.
- **The pace comes at birth.** `Pace` holds the phases and the longest step. The renderer's start
  functions read both from `@archboard/timing` and hand them to every painter.
- **A frame says what moves after it.** `Motion` is still, traffic alone or moving, so the page
  no longer asks whether traffic moves alone at the moment it just drew.
- **The stage keeps the parts of a strip canvas, and each draw says whether to keep them.**
  `Surface::Strips` wraps the canvas in the stage's part store and culls to the stage's size.
  `Surface::Direct` draws whole, as the GPU canvas, a recording canvas and the bench's counting
  canvas need.
- **The WebAssembly painter mirrors the stage.** It takes the presentation, the arrival and the
  departure as JSON, and keeps one numeric `setCamera`, so a glide parses no JSON on each frame.
  `PictureStage` keeps its own methods and its held presentation, and a new painter takes that
  presentation in one statement, then the picture.

## Rejected

- **The stage compares a presentation with the last one and applies only what changed.** A
  restated timed value starts over today: the same camera target at 0 ms lands a glide at once.
  A comparison would skip that, and it would compare sets of subjects on every call.
- **A flag at birth says whether the stage keeps parts.** The bench counts a frame drawn whole on
  every painter. A flag would cull its count on the strip painters, so the choice is made per draw.
- **One `present` that also carries the arrival.** One operation over unrelated changes is the
  dispatcher that [ADR 0058](0058-an-interface-is-the-few-operations-its-callers-need.md) rejects. An arrival changes the picture, a departure changes what
  becomes of the picture already shown, and a presentation changes how it is seen.
- **The light must reach the stage before the arrival.** A cut and an entrance mark the light to
  stand at the next frame, and nothing else touches the light, so the light stated before or
  after the arrival draws the same frames. A seam test pins both orders.

## Consequences

- The page states each decision once, and in no required order within a turn.
- The CPU painter draws the same frames as before, byte for byte, over a scripted run of every
  arrival, departure, light, sweep, traffic and view.
- A new timed value names its moment in its own type, or the stage cannot read the clock for it.

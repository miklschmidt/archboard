---
status: accepted
---

# A traffic mark answers its pulse train, and each painter spells and clocks it

The owner's advisors decided this on 2026-11-19 (TASK-653.01, the archboard-deepen run). It
says how [ADR 0059](0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md)
and [ADR 0071](0071-vello-paints-the-canvas-and-motion-lives-in-the-painter.md) split a pulse
between the scene and the painters. It keeps the traffic contract of
[ADR 0027](0027-explicit-traffic-controls-distance-based-animation.md).

## Context

ADR 0071 gave each painter its own motion and clock. Both painters took that to include the
geometry of a pulse. The SVG painter and the canvas painter each cut a route into pieces, sized
the light's box, built the glow and the gradient, and worked out the turn window. The two
copies used different float math, and only the SVG's copy had tests, through the markup.

## Decision

- **The scene answers a traffic mark's pulse train.** `pulse_train(&TrafficMark)` gives the
  numbers every painter draws: the pieces of the route with their frames, light boxes and bars,
  the glow layers, the gradient stops, and how each piece's bar slides.
- **The painter owns the clock, and the scene maps a moment to a position.**
  `pulse_slide(&LegMotion, seconds)` says where a piece's bar stands at a moment of the painter's
  clock, or that a message's pulse is off the piece then. The canvas painter asks it every frame.
  The SVG painter reads the window and the slides at its ends, and lets SMIL run the clock.
- **The pulse train uses the core's deterministic math**, the SVG painter's operations in their
  order, so a native build and the WebAssembly build write the same bytes (ADR 0059).
- **Spelling stays in each painter.** The SVG painter keeps path data, ids, digits, the frame's
  degrees and SMIL. The canvas painter keeps kurbo paths, peniko gradients and its `f32` casts.
- **The builders are Painting's vocabulary, not the scene's interface.** The setters and the
  shape, stroke and colour constructors live in Painting's private build file, because each is
  one assignment and Painting is their only production caller. The scene keeps `Group::new`,
  `Transform::translate` and `Text::set`. Rust allows inherent methods only in the crate that
  defines the type, so if Painting becomes a crate of its own, the builders become a private
  extension trait there, and no call site changes.

## Consequences

- A pulse's numbers have one owner and one set of tests, in `archboard-scene`.
- The canvas draws with the SVG's math, so its frames may differ from before in the last bit of
  a coordinate. Paint parity compares them with the SVG.
- A change to how a pulse looks changes the pulse train, not a painter, unless it changes only
  how one painter spells it.

---
status: accepted
---

# A layout learns a part's size from the measurer

The owner's advisors decided this on 2026-11-19 (TASK-653.20, the archboard-deepen run). It
carries out what [ADR 0059](0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md)
decides: words are measured before layout, and the core owns measurement.

## Context

The painter published its size sheet (`paint::design`, 44 getters). The sequence layout in
`archboard-flows` bound 28 of them and rebuilt each part from them: a card's text run, its title
fitting and its height, a label's plate, an arrow's ends, a fragment's tab, a flow's heading. The
painter rebuilt the same parts from the same sizes. The two crates agreed only by repeating the
arithmetic, and some facts had no shared name at all: a card's heights lived in the layout and its
baselines in the painter, and the lifeline's gap and its dash offset were each written from the
card's shadow.

## Decision

- **A layout asks the measurer for a part's size.** Flow part measures (`flow_parts/` in
  `archboard-scene`, re-exported from its root) answers each part a flow layout places:
  `sequence_cards`, `message_plate`, `note_plate`, `message_ends`, `activation_span`, `self_loop`,
  `fragment_head`, `fragment_bounds`, `flow_tab` and `shape_words`. The layout keeps where parts go
  and how far apart: columns, pitches, gaps, corridors.
- **The sheet stays private to the crate of measurer and painter.** No crate outside reads a size.
  A size that both the measurer and the painter use sits in the sheet once; the painter draws from
  the measure's answer, carried in the drawing, or from the same private size. A crate split keeps
  the measurer, the painter and the sheet together, or splits the sheet by reader without making
  a size public.
- **Any word the layout measures and the painter draws has one speller.** The fragment's operator
  is spelled through `names::word`, and a guard's brackets by one function beside the sequence's
  drawing types.
- **The painter keeps a few answers of its own for the architecture layouts:** the page's margins,
  a card's radius, a frame's tab width and a container's header pair, and the far view's line scale
  and widths.

## Rejected

- **Moving the sequence layout into `archboard-scene`, beside its painter.** It would bring the
  flow content types the flowchart and the renderer share, and the drawing crate would hold a
  layout as well as the contract, the measurer and the painter.
- **Handing every inner position over in the drawing,** so the painter stops reading the sheet for
  sequences. The layout would then need the painter's own sizes (baselines, optical centres), which
  moves the sheet the other way.
- **Spending the crate's one keyed getter on sizes.** The sizes feed another module's arithmetic,
  which is what a module can do for itself, and publishing them through a getter undoes the private
  sheet.

## Consequences

`archboard-flows` binds no size of the painter, and a test there lays a sequence out, paints it and
checks each card's words inside its text run and each message's ink inside its row. Painting's
interface falls from 51 names to 17.

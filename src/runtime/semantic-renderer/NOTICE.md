# Third-party notice

This module is an in-repository fork of both grammars of the PR Lens SVG renderer —
**architecture** and the message-sequence grammar it calls **data-flow** — taken from
the `pr-lens` project at revision
`0993b4dec8ae73f5e000370e6a758cdd8aa2bfd0`. The packages it was taken from are
`@coldtea/pr-lens-renderer` 0.2.4 (the renderer itself) and
`@coldtea/pr-lens-schema` 0.2.1 (the node-kind and edge vocabularies its layout
reads). It is a fork rather than a dependency because almost every adaptation
below changes behaviour inside the renderer rather than around it.

What was carried across, largely intact: the rank-and-seating layout that derives
rows from the edge graph, the orthogonal edge router with its corridors, bands,
ports, tracks, braid guard and label-pill settling, the sequence skeleton of shared-width
participant columns over hanging lifelines, its derivation of activation bars from
synchronous calls and the replies that answer them, its self-message loop, the kind
glyphs, the deterministic coordinate rounding, and the XML-escaping SVG primitives.

What was changed, and what that change is:

**Adapted to Archboard's contract — these are permanent.**

- **Lanes became regions derived from containment.** PR Lens requires every node to
  name a lane. Archboard has structural containment instead (ADR 0023), so the bands
  are derived from the containment forest. The rule is written down in
  `lib/regions.ts`. Nesting deeper than one level is drawn flat for now; TASK-172
  owns rendering real nested containment.
- **Text is measured, not estimated.** PR Lens's glyph-advance table in `text.ts` was
  deleted outright. Widths come from `@/runtime/engine/measure-text`, which reads the
  real font files, because "text width is measured, not estimated" is a standing
  invariant of this repository.
- **Selection hooks were added.** Every drawn subject carries
  `data-semantic-kind` / `data-semantic-id`, and the embedded stylesheet has an
  `.is-selected` rule a viewer toggles. The document stays script-free.
- **The palette was rebuilt** against Archboard's own operator shell rather than
  GitHub's pull-request colours.
- **A flow is a framed subject, and its participants have no labels of their own.**
  PR Lens drew one lane band per participant column and let a flow override a node's
  label per flow. Archboard draws one named frame around the whole exchange — a flow
  is a subject a reader selects, and stacked flows have to be told apart — and a
  participant is drawn from its node alone, because a second spelling of a name is a
  second thing to keep in step (ADR 0023).
- **Sequence sizes are uncapped.** Upstream bounds a flow at 12 participants and 64
  messages. ADR 0023 refuses size-driven limits, so those are gone and every fold over
  participants or steps is written as a loop rather than as a spread into `Math.max`,
  which has a length a machine enforces.
- **A message's label sits above its arrow** rather than astride it. An architecture
  route bends and doubles back, so the only reliably readable place for its words is on
  top of it; a message is a straight horizontal run whose whole meaning is which way it
  points, and a plate through the middle of one cuts the line in two.

**Taken back after it was dropped.**

- SMIL animation: the travelling dot, the per-message slots and the shared cycle — one
  clock for the whole drawing, as upstream had it, so a page of exchanges is told in the
  order its flows are stated rather than all at once. They
  were dropped on the reasoning that motion in a walkthrough belongs to the viewer, and
  that was half right — the viewer does own the camera and the beats, and the dots do not
  touch either. What the reasoning missed is that a line which carries traffic and a line
  which merely exists look identical without them, and an exchange drawn still reads as a
  ladder rather than as something happening.

  What did not come back is the `animated` flag. Motion is presentation and presentation
  is the renderer's (ADR 0023), so which lines move is derived from what the board already
  says: the kind of relationship (a call carries something, a dependency is a fact), the
  emphasis it was given, and the repeat on a step. Nor is there any way to ask for a
  still picture: a reader who has asked their system for less motion is honoured by the
  drawing itself, through a `prefers-reduced-motion` rule in its own stylesheet, which
  works in a pane and in a file that outlives the call that made it alike.

**Dropped for good — Archboard is not a pull-request tool.**

- Pull-request provenance: repository owner, base and head SHAs, the pull-request
  number. A semantic board is not about one diff of one repository, and its nodes may
  bind to different repositories.
- The render manifest, content-addressed asset naming and the corrections overlay.
  Those exist to post pictures into a pull-request comment; Archboard serves a live
  pane and re-renders on demand.

- **Comparison arrives as an argument, not as content, and is drawn in three
  channels rather than in colour.** PR Lens carried a `delta` on the diagram
  itself — an authored flag per node, GitHub's added/removed/modified colours, a
  change badge and a dead band for a removed node. None of that was taken. A
  standing is handed to a render as a plain map derived that instant from the
  variant's actual predecessor, because agents must not author change flags
  (ADR 0023), and how it is drawn is decided in `lib/svg/standing.ts`: a pin whose
  shape says which standing it is, ghosting for the one that is not on the
  proposal, and a texture on the subject's own outline — or, for a line, on a
  swipe laid under it, because a line's dash and weight already mean something
  here and upstream's did not. Colour is the fourth thing said and never the
  first, and the three hues are the only saturated ink in the palette.

**Deferred to a later ticket — in scope, not yet taken.**

- **Walkthrough presentation.** The geometry atlas this renderer already returns is
  what a narrative rail focuses against; TASK-178 builds the rail and the scroll-driven
  focus in the viewer.

**The renderer owns its own type.**

PR Lens named generic CSS stacks — `-apple-system, BlinkMacSystemFont, "Segoe UI"…` —
and sized every box from a table of glyph advances with enough slack that the error
against whatever face a reader's machine supplied stayed invisible. Neither half of that
survives here. Widths are measured, so the face that was measured has to be the face that
is drawn, and a document that names a family it does not register draws in whatever the
host happens to have.

So the document registers its own faces. It emits `@font-face` rules for
**Archboard Diagram Sans** (Onest) and **Archboard Diagram Mono** (DM Mono) at weights
400 and 500, from the files in `src/ui/shell/assets/fonts`, and every piece of text names
one of those four. The names are deliberately not the shell's own `Archboard Onest` and
`Archboard DM Mono`: the application stylesheet registers those from the variable file
across 400-700, and a second registration of the same name from a different file would
be a coin toss over which file a weight came from.

A caller chooses where the bytes come from. `fonts: "linked"`, the default, points at the
four files the canvas serves at `/assets/diagram-fonts` — what a pane uses. `"embedded"`
carries them as data URIs, so an exported file draws the same picture on a machine that
has never heard of Archboard.

Only 400 and 500 exist. Nothing asks for 600 or 700: a browser would synthesise one,
wider than anything that was measured, and a fitted title would overflow the card it was
fitted to. `DiagramWeight` in `lib/fonts.ts` makes that unsayable and
`font-synthesis: none` in the document makes it harmless.

Onest and DM Mono are used under the SIL Open Font License, whose texts are
`src/ui/shell/assets/fonts/OFL-Onest-1.1.txt` and
`src/ui/shell/assets/fonts/OFL-DMMono-1.1.txt`.

## MIT License

MIT License

Copyright (c) 2026 Coldtea AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

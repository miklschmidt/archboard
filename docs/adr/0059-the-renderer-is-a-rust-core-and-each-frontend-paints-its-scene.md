---
status: accepted
---

# The renderer is a Rust core, and each frontend paints its scene

The user decided this on 2026-10-24. TASK-520 and its subtasks build it. When the task that builds a change lands,
that change replaces a clause of an earlier decision:

- the clause of [ADR 0014](0014-no-build-step-bun-runs-the-source.md) that only
  the browser bundle is built (TASK-520.01)
- the clauses of [ADR 0033](0033-graphviz-placement-and-obstacle-routing.md)
  and [ADR 0040](0040-track-and-blocks-replace-the-graphviz-engine.md) that
  libavoid routes the trunks of Blocks (TASK-520.02)
- the invariant of `AGENTS.md` that the canvas of the place that draws a word
  also measures it (TASK-520.07)

## Context

The renderer is about 43,000 lines of TypeScript. It measures text, lays out a
board and writes one SVG document. That document is not a static picture. SMIL
moves the traffic pulses. CSS custom properties and transitions move words
between the near and the far view. The browser viewer sets classes that its
style sheet turns into the light and the recede
([ADR 0042](0042-the-picture-answers-the-hand-and-a-card-opens-by-flight.md)).
So only a browser draws the picture faithfully. A native frontend, such as an
experiment with GPUI and Vello, needs its own runtime for SVG, CSS and SMIL to
draw it. The static SVG renderers that a native frontend can use draw none of the
motion, and vello_svg also draws no masks, clips or group opacity.

libavoid routes the trunks of Blocks, and it is the largest single cost of a
render. Its unifying nudging prepass spends tens of seconds on dense boards
(TASK-512). Its nudging solver signals an unsatisfiable constraint set with a
C++ exception, and one slow solve threw 762,356 of them
(`docs/design/layout-rules.md`). libavoid is licensed under LGPL-2.1-or-later.
Archboard loads it today as a separate WASM module.

Text is measured by the canvas of the place that draws it: the canvas of the
browser, or `@napi-rs/canvas` under Bun. Two places can measure a word
differently, and a picture holds only where its fonts load.

The layout engine moved to Rust once already. Every solve of the renderer tests ran
through elkjs and through `@archboard/elk-rs`. Each difference was fixed
against stored elkjs output, and then elk-rs replaced elkjs (`layout-rules.md`,
section 23).

## Decision

### One core, compiled for every host

The renderer becomes a Rust crate, the renderer core. It is compiled to
WebAssembly for Bun and for the browser, and a native frontend links it
directly. Bun and the browser load the same WASM file. So the CLI, the
Archboard server and a browser tab lay out a board to the same numbers. The
core avoids float operations whose result depends on the platform, so a native
build draws the same bytes as the WASM build.

### The output is a scene

The output of the core is a scene. A scene is the ordered and positioned
list of what a picture is made of: shapes, fills, masks, clips,
glyph runs, and the marks that a painter animates. Each group in it names the
subject that it draws and its role. With these names, a painter can light,
recede or pick out a part without reading the structure of the picture. Traffic is data on the
scene: the route pieces, the speed and the spacing of
[ADR 0027](0027-explicit-traffic-controls-distance-based-animation.md). It is
not SMIL.

The scene holds no interaction state. The light, the recede, the far view,
the camera and the flight stay presentation, and each painter owns them
([ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md)).

The types of the scene are defined once, in Rust. The TypeScript types are
generated from them. They hold what the picture means, not how SVG spells it:
no element name, attribute, path data or CSS expression. A colour names the
page's tokens and the operations that mix them, and every id is minted from
what it names. [The typed scene](../design/typed-scene.md) describes the
vocabulary and why it has that shape.

### A painter turns a scene into what a frontend shows

The SVG painter is part of the core, in a crate of its own (`archboard-svg`),
and it holds every SVG and CSS spelling. So an export, a README asset and a picture
in the browser are the same bytes wherever they are made. The SVG painter
writes traffic as SMIL for an export, as it does today. The browser viewer
keeps its classes and Web Animations over that SVG. A native frontend paints
the scene itself. A GPUI frontend that paints with Vello comes after
TASK-520 and is not part of it.

### The core shapes text into glyph runs

The core shapes text with harfrust and skrifa, on the font files in
`packages/renderer/assets/fonts`. The scene carries glyph runs: the face,
the size, the id and the position of each glyph, and the string of the run.
The SVG painter defines each glyph that a picture uses once, as a path, and
uses it again wherever it occurs. It writes the string of each run as
accessible text, so search, copy and screen readers still find the words.

So a picture looks the same in every place and needs no font to be loaded. This
replaces the invariant that the canvas of the place that draws a word also
measures it. The core measures every word, and every painter draws the glyphs
of the core.

The user accepted three costs. A browser draws a glyph path without font
hinting, so small text on a 1080p screen can look a little softer than hinted
text. A picture with many distinct glyphs grows. The accessible text is a
second copy of the words. TASK-520.07 compares the small text with the
pictures of today before it lands.

### The core routes with its own router

The core routes the trunks of Blocks with an orthogonal router of its own. The
router is written from the published algorithms of orthogonal connector
routing and nudging, not from the source of libavoid. So the core is not a
derived work of LGPL code. The output of libavoid-js can be compared as a black
box while the router is built. Nobody who writes the router reads the source of
libavoid, the libavoid-js patch in `patches/`, which edits code that libavoid
ships, or any port of libavoid. The writer can read archboard's own code and
notes that call libavoid or describe what it was seen to do, such as
`unsatisfiable.ts` and the notes of TASK-512, but the router does not follow
them. A route is judged by the measures of
[ADR 0039](0039-a-drawing-is-measured-by-how-easily-it-reads.md), not by
equality with the route of libavoid.

### Graphviz stays with the host for now

[ADR 0060](0060-the-core-lays-graphs-out-with-a-vendored-graphviz-pure.md)
replaces this section: the core lays graphs out with a vendored
graphviz-pure, and no worker puts Graphviz back before a solve.

Graphviz places cards in Track and Blocks. During the port it is a capability
that the host gives the core. The WASM core calls `@viz-js/viz` through an
import, and a native build links Graphviz. Whether the core replaces Graphviz
is a separate decision.

### The host gives the core what only its place has

The core draws a picture in one call: the reading to draw, the vault's policy
and the render's choices go in, and the document, its atlas, each subject's
appearance and the picture's key come out (`render`, TASK-520.08). The core
also keeps the scene, for a frontend that paints it itself. A host gives the
core four things that only the place it runs in has. In the request, it gives
the durations of `@archboard/timing` and, where a document can stand alone, the
theme colours. Through a port, it runs the layout's solves and gives the path
data of the icons that a picture draws.

[ADR 0061](0061-group-regions-are-packed-before-solving.md) proposes choosing group packing
before solving graphs that contain multi-member regions, without a card-count cutoff (TASK-548.08).
The council rejects the first candidate because it hides parent frames.
The repaired candidate and the broader packing rule await the next council verdict.
The group-packing competition below describes the baseline until that decision is accepted.

The core chooses between the solves of a board itself: which joins to keep,
whether a block stacks, whether groups pack. It asks for every solve that a
choice reads before it waits for any of them, so a host runs them side by side
on as many workers as it has. When the core no longer needs a solve, the
host calls it off. A solve that still waits for a worker is never laid out. A
solve that a worker already lays out answers all the same, and a later choice
that needs it again shares that answer (TASK-464). A worker runs one solve
with `layOutBoard`, and puts Graphviz back as it was loaded before each solve.
The renderer package
holds no rule of layout, painting or measurement. It resolves a board's
variant, view and comparison into a request and runs the solves.

### Every port step has an oracle

The port starts at the output. First the core paints the drawing that the
TypeScript layout answers. Every corpus picture must then be the same bytes as
the picture of the TypeScript painter. Then each layout engine moves to Rust,
and it must answer the drawing that the TypeScript engine answered on the
corpus. The corpus holds the dogfood vault and the vaults under `examples/`. It
draws every board whole, every view and every non-current variant. It draws
each under both engines and both themes, with and without the comparison.

Two steps change pictures on purpose: the router and the text. Each of them is
judged by the measures of ADR 0039, and a person reviews its changed pictures
before it lands.

### Build

The Rust crates live in `crates/`, each in a folder named for its crate, and
one Cargo workspace at the root of the repository holds them. The JavaScript
packages stay in `packages/`. This is the layout of most repositories that
hold both, and it lets a native frontend and later Rust crates join the same
workspace. The renderer package loads the core and stays the host that
JavaScript callers import
([ADR 0055](0055-packages-own-behavior-and-apps-compose-it.md)). A Nix flake
gives the dev shell its tools: the Rust toolchain with the
`wasm32-unknown-unknown` target, a `wasm-bindgen` CLI of the same version as the
crate's `wasm-bindgen` dependency, and Bun. A person who installs from a clone
uses that shell or installs the same tools.

The WASM build is a derived artifact, and Git does not track it. ADR 0014
removed the build step because a compiled copy can be stale with no symptom. So
the build records a hash of the sources of the core. If the hash of a build differs from the
sources in its checkout, a host refuses to load it. The refusal names the
command that builds the core. The CLI and the Archboard server still
run their TypeScript from source.

## Consequences

A native frontend gets the whole renderer without a JavaScript engine or a
browser.

The server, the CLI and every browser draw a board to the same bytes. Today
each place measures with its own canvas.

Every contributor needs the Rust toolchain, and a change to the core needs a
build before the next command uses it. Tuning a layout rule now includes a
Cargo build. `layout-rules.md` stays the record of what each rule is for.

When TASK-520 closes, the TypeScript layout and painting rules, Pretext, canvas
measurement in the renderer, and libavoid-js are gone from the repository.

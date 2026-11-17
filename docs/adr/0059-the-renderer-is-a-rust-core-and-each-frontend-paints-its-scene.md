---
status: accepted
---

# The renderer is a Rust core, and each frontend paints its scene

This decision replaces the clause of
[ADR 0014](0014-no-build-step-bun-runs-the-source.md) that only the browser
bundle is built, and the clauses of
[ADR 0033](0033-graphviz-placement-and-obstacle-routing.md) and
[ADR 0040](0040-track-and-blocks-replace-the-graphviz-engine.md) that libavoid
routes the trunks of Blocks.

## Context

The renderer was TypeScript that wrote one live SVG document. SMIL, CSS
transitions and the browser viewer's classes animate it, so only a browser draws
the picture faithfully. A native frontend needs its own runtime for SVG, CSS and
SMIL to draw it.

libavoid routes the trunks of Blocks, and it is the largest single cost of a
render. It is licensed under LGPL-2.1-or-later.

Text is measured by the canvas of the place that draws it. Two places can
measure a word differently, and a picture holds only where its fonts load.

## Decision

### One core, compiled for every host

The renderer becomes a Rust crate, the renderer core. It is compiled to
WebAssembly for Bun and for the browser, and a native frontend links it
directly. So the CLI, the Archboard server and a browser tab lay out a board to
the same numbers. The core avoids float operations whose result depends on the
platform, so a native build draws the same bytes as the WASM build.

### The output is a scene

The output of the core is a scene: the ordered and positioned list of what a
picture is made of. Each group in it names the subject that it draws and its
role. With these names, a painter can light, recede or pick out a part without
reading the structure of the picture. Traffic is data on the scene, not SMIL.

The scene holds no interaction state. The light, the recede, the far view,
the camera and the flight stay presentation, and each painter owns them
([ADR 0023](0023-semantic-boards-own-meaning-renderers-own-presentation.md)).

The types of the scene hold what the picture means, not how SVG spells it.
The SVG painter is part of the core, and it holds every SVG and CSS spelling.
So an export, a README asset and a picture in the browser are the same bytes
wherever they are made. A native frontend paints the scene itself.

### The core shapes text into glyph runs

The core shapes text with harfrust and skrifa, on the font files that the
repository ships. The SVG painter draws each glyph as a path, and writes the
string of each run as accessible text, so search, copy and screen readers still
find the words. So a picture looks the same in every place and needs no font to
be loaded. This replaces the invariant that the canvas of the place that draws a
word also measures it.

The user accepted three costs. A glyph path has no font hinting, so small text
on a 1080p screen can look a little softer. A picture with many distinct glyphs
grows. The accessible text is a second copy of the words.

### The core routes with its own router

The core routes the trunks of Blocks with an orthogonal router of its own. The
router is written from the published algorithms of orthogonal connector
routing and nudging, not from the source of libavoid. So the core is not a
derived work of LGPL code. Nobody who writes the router reads the source of
libavoid, the libavoid-js patch, or any port of libavoid. The output of
libavoid-js can be compared as a black box. A route is judged by the measures of
[ADR 0039](0039-a-drawing-is-measured-by-how-easily-it-reads.md), not by
equality with the route of libavoid.

### Graphviz stays with the host for now

[ADR 0060](0060-the-core-lays-graphs-out-with-a-vendored-graphviz-pure.md)
replaces this section.

### The host gives the core what only its place has

A host gives the core only what the place it runs in has, such as durations,
theme colours and icons, and it runs the core's layout solves on its workers.
The core chooses between the solves of a board itself, and asks for every solve
that a choice reads before it waits for any of them.
[ADR 0061](0061-group-regions-are-packed-before-solving.md) proposes replacing
these choices.

The renderer package holds no rule of layout, painting or measurement. It
resolves a board's variant, view and comparison into a request and runs the
solves. It stays the host that JavaScript callers import
([ADR 0055](0055-packages-own-behavior-and-apps-compose-it.md)).

### Build

The WASM build is a derived artifact, and Git does not track it. ADR 0014
removed the build step because a compiled copy can be stale with no symptom. So
the build records a hash of the sources of the core. If the hash of a build
differs from the sources in its checkout, a host refuses to load it. The CLI and
the Archboard server still run their TypeScript from source.

# The typed scene

TASK-520.10, 2026-10-25. This note describes the scene that the renderer core
answers ([ADR 0057](../adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md))
and why each part of it has the shape it has. The types are in
`crates/archboard-scene/src/scene/`. The SVG writer is `crates/archboard-svg`.

## What changed

Before this task, the scene was SVG markup held as Rust values. A shape was an
element name and a list of attribute strings. A colour was a CSS expression,
such as `color-mix(in srgb, var(--semantic-sky) 72%, var(--background))`. A
mask had an id that was a hash of its markup. A native painter had to parse
SVG path data and CSS to draw it.

Now the scene holds what the picture means, as typed values. No scene type
holds an SVG element name, an attribute name, path data or a CSS expression.
The SVG writer turns the scene into the document, and it writes every corpus
picture as the same bytes as before.

## The vocabulary

A scene is a page size, a background colour, a list of definitions and a body.
The body is a list of items, in the order they are drawn. An item is one of
these:

- A group. It holds items, and it says what it is to the picture.
- A shape. It has a geometry, a fill and a stroke.
- A text, which is one run of words.
- An icon, which is a Remix Icon by its name.
- A viewport, which draws some items into a box of their own.
- Some definitions, which the items after them refer to.
- Traffic, which is a train of pulses on a route.
- A break, which is a line break in the SVG document.

### Groups: a role and a subject

A group has a role. The role says what the group is to the picture: a card, a
container's frame or header, a relationship's line, a label, a lifeline, the
near or far view of a card, a drill mark, a pin, a legend entry, and so on.
A role carries the facts that come with it. A card's role carries the
appearance it was drawn with. A line's role carries its kind and its line
appearance. A chip's role carries where it stands from far away.

A group that draws a subject names it: the subject's kind, its id and its
standing in a comparison. A group can also have a transform, an opacity, a
mask, the subjects it stands with, and whether it takes the pointer.

A painter reads the role and the subject to light, recede or pick out a part.
It does not read the structure of the picture. The legend of an export reads
the same roles: it finds the kinds a picture draws from the facts on each
card's and line's role.

### Shapes: a purpose, a geometry and paint

A shape has a purpose, such as plate, border, halo, line, swipe, outline,
port or sample. The purpose says what the shape is to the picture. A painter
that only draws can ignore it, but two readers use it:

- A viewer hides a halo, a ring or a lit line until the person selects the
  subject, so it finds them by purpose.
- The SVG writer chooses the order of an element's attributes and the
  spelling of its path data by purpose. Before this task, each paint function
  wrote its own attribute order. The purpose keeps those orders, so the bytes
  do not change.

The geometry is a rectangle with an optional corner radius, a circle, a line
or a path. A path is a list of steps: move, line, across, down, quadratic and
cubic curves, arcs, and the relative forms that a self message uses. A
painter turns the steps into its own path type without parsing anything.

Every number in a shape is the number the picture is drawn with. The painter
rounds a coordinate to a hundredth where the picture always rounded it, so
two painters draw the same geometry.

### Paint and colour: tokens and operations as values

A fill or a stroke is a paint: none, a colour, or a gradient by its id. A
colour is one of these:

- A token of the page's theme, such as the background, a card's face or the
  selection ring. The token is an enum, not a CSS variable name.
- A named palette colour of the vault's policy, such as sky or rose.
- Black, white or transparent.
- A mix of two colours in sRGB, with the share of the second.
- One colour on the light theme and another on the dark theme.
- A tone of an ink in OKLCH: the ink's hue, a lightness, and a share of its
  chroma up to a cap.
- An ink with its OKLCH lightness held between two bounds.

So one scene draws in either theme. A painter resolves each token in the theme
it shows, and it computes each operation as CSS defines it. The SVG writer
spells each colour as the CSS expression that the picture always held, so a
browser does the same work.

### Text: a glyph run and its words

A text is one run as the core shaped it (TASK-520.07): the left end of its
baseline, a face (family and weight), a size, a fill, how far its glyphs
advance, the units per em of its face, its glyphs, and its words. Each glyph
is an id in the face and a place in font units from the start of the run. The
core has already resolved centring and a central baseline into the point, so
a painter draws the glyphs where they stand and does no text layout. The words
stay with the glyphs, so search, copy and screen readers still find them.

`archboard-text` shapes a run and breaks a paragraph to a width with the
bundled font files. The scene's `measure` module is the one place that the
layout crates and the painters ask for a width or a line break.

### Icons and viewports

An icon names a Remix Icon, its size and its ink. The painter names the icon
the kind asked for when the host has it, and the fallback icon otherwise. Each
frontend draws the icon from its own icon set. The SVG writer copies the
host's path data into the document.

A viewport draws some items from their own space into a box. The legend's
arrowhead and pulse samples use one.

### Definitions: named by what they are for

A definition is an arrowhead marker, a gradient, a mask or a clip. Each has an
id that is a value: the arrowhead of a weight and an ink, a patch of the soft
shadow by its row and column, the mask of one relationship's line, the clip of
one card. The scene mints every id from these values. No id comes from
markup.

The SVG writer spells each id. A mask's and a clip's id is still a hash of the
markup the writer writes for it, so a mask has the same id as before. That
hash is now the writer's business, not the scene's.

### Traffic as data

Traffic is the route its pulses ride, how they move (a steady train, or one
pulse a turn of the shared clock), the colours of a pulse and the width of
the line under it. The lengths of a pulse's front, head and tail live once,
in `scene/traffic.rs`. The painter reads them to time the clock, and the SVG
writer reads them to draw each pulse as a beam of light in SMIL.

### Line breaks

The SVG document has line breaks between some of its elements. The scene keeps
them as break items, so the document keeps its bytes without a rule for where
the breaks fall. A painter other than the SVG writer skips them.

## How a GPUI painter reads a scene

A native painter walks the body in order:

1. For a group, it pushes the group's transform, opacity and mask, and it
   notes the role and the subject for selection and lighting.
2. For a shape, it builds a path from the geometry, resolves the fill and
   stroke paint in its theme, and draws them. A halo, a ring and a lit line
   stay hidden until their subject is selected.
3. For a text, it draws each glyph of the run from its face at its place,
   scaled from font units to the size.
4. For an icon, it draws the icon from its icon set in the ink.
5. For traffic, it animates the pulses along the route from the motion.
6. It reads definitions when it meets them, and it skips breaks.

The near and far views are two groups by role. The chip and the words carry
their far place on their role, so a painter can move them between the views
itself.

## What the SVG writer owns

`archboard-svg` holds every SVG and CSS spelling: element names, the order of
attributes by purpose, the spellings of path data, colours as CSS, the
ids of definitions, the stylesheet and its class names, the glyph outlines,
and the pulses as SMIL. It defines each glyph a picture draws once, as a path
in font units, and writes each run as a group of uses of those paths. After
the group it writes the run's words as a `<text>` in no ink, stretched over
the run's advance with `textLength`, so a page search finds the words where
they are drawn. It is the one place that knows the picture is an SVG document.

## Marks a viewer draws beside the picture

A pane draws some marks itself, without the core: the key's line samples, the
pin of a standing and the warning on a subject that nobody decided. These must
look like the marks in the picture. `paint::viewer_marks()` gives them as
scene values from the painter's own rules: the line widths, the arrowhead's
length and arm, the pulse's breadth, each line's and pulse's ink, the pins and
the warning. `bun run build:core` runs the `export-marks` binary of
`archboard-svg`, which writes them as TypeScript constants to the ignored
`generated/core/marks.ts`. So the TypeScript holds no copy of these numbers
or inks.

## Evidence

The full corpus drew the same bytes before and after the change, and so did
the export corpus. The task's notes hold the counts.

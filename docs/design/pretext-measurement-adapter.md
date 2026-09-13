# Pretext measurement adapter

The renderer pins `@chenglou/pretext` 0.0.9 for whitespace handling, Unicode
segmentation and line breaking. A Bun package patch adds the synchronous
`setMeasureFunction((text, font) => width)` seam proposed upstream in
[PR 17](https://github.com/chenglou/pretext/pull/17), with the font passed explicitly.
Upstream's published entrypoint requires a browser Canvas and does not expose an
adapter. The source and distributed JavaScript/declarations carry the same patch.

The renderer registers one callback at module initialization. It resolves only
font strings registered by its typography roles and calls `measureLineIn` against
the bundled face files. Nothing adds DOM globals or installs a native canvas.
Preparation stays synchronous, as it is upstream; the callback must not invoke
Pretext recursively. Setting a different callback clears measurement caches.
Pretext keys widths by the complete font string, including family, weight and size.

Pretext owns wrapping. The renderer measures each materialized line again as a
whole string because segment sums can miss kerning across segment boundaries.
Those exact widths determine the final box minimum. Titles and responsibilities
keep all their words at fixed readable sizes; descriptions belong to inspection.
This does not expand the glyph coverage of the bundled fonts.

On an upgrade, check whether upstream now provides a supported measurement
adapter and remove the patch when it does. Otherwise inspect changed measurement
paths before rebasing this small patch. The runtime measurement tests exercise
wrapping, face changes, complete words and containment using the actual fonts;
the existing measured-text browser test compares the font engine with Chrome.

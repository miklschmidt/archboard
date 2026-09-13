# Measured compound renderer

Architecture rendering has three owners: measurement, compound layout, and SVG
painting. `renderArchitecture` and `renderSemanticView` return promises because
ELK runs in a private Bun worker. The HTTP render route awaits the complete
drawing before returning SVG and its interaction atlas. Sequence rendering keeps
its existing grammar.

`lib/measurement.ts` prepares complete titles, responsibilities, and relationship
labels with Pretext and the bundled font files. The prepared lines include their
font, size, width, and baseline. A card grows to hold its text instead of shrinking
or truncating its title. See [the adapter contract](pretext-measurement-adapter.md)
for the pinned upstream patch.

`lib/layout/compound-graph.ts` translates semantic containment to an ELK hierarchy.
Cards have measured dimensions; frames reserve their measured header and inset
space for children. Each connection gets distinct ports. Consecutive forward
connections use bottom/top ports, forward skips use the left, and returns use the
right. ELK owns placement, ports, orthogonal routes, and label boxes together.

`lib/layout/compound.ts` runs that graph and exposes one `ArchitectureDrawing`.
Missing cards, routes, or label geometry fail the render rather than silently
dropping subjects. A shared worker serializes concurrent requests and keeps the
process alive only while requests are pending. The pinned ELK package patch fixes
an optional-children TypeScript declaration and preserves supplied label positions
when the interactive engine creates its internal label nodes. Without the latter,
incremental placement sends label routes toward the origin, producing long detours.
The same patch supplies long-edge dummy positions using ELK's existing position
calculation, allowing its normal crossing sweep to keep routes clear through
containment. Card ordering uses interactive hints with semi-interactive crossing
minimization; fully interactive crossing was rejected after it routed through
unrelated cards in compound graphs.

`lib/svg/architecture.ts` paints the supplied drawing. It does not fit text,
move cards, or repair routes. The atlas uses those same boxes and curves, with
the same document translation. Change standings and reconciliation marks do not
affect layout. The old grid, corridor, congestion, and label repair passes have
been removed.

## Placement across variants

Architecture proposals use their direct predecessor as placement context in the
same board-owned view. The server supplies the scoped ancestor pictures, oldest
first, including the removed subjects each ancestor actually shows. The renderer
derives their layouts in that order; no coordinates are authored or saved in a
board. A nested proposal therefore starts from its parent's drawing.

Existing card positions seed the next engine run. Existing card dimensions do
not shrink, and surviving connections retain their attachment faces. New cards
receive placement seeds from their connected predecessors and successors. ELK
still owns the final collision-free spacing, routes, and measured label boxes.
An unchanged layout reuses its predecessor geometry exactly.

This preserves the diagram's reading order and familiar columns rather than
promising absolute pixel locks: inserting a stage or growing its text can move
nearby cards to make space. The viewer preserves the camera across variant
changes, including uncached requests, so a new fit does not disguise that
continuity. A different board, view, or walkthrough focus fits afresh; explicit
Fit shows the full selected drawing.

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
space for children. Consecutive forward connections use bottom/top ports and
returns use the right. A forward skip from a card with fewer than three forward
relationships brackets its chain from the left (one per card); a skip from a
hub gets no port on a first render and the engine attaches it where its own
columns fit, which is what keeps a hub from fanning lanes down the margin
([layout-rules.md](layout-rules.md)). Under a predecessor the cards are
pinned, so a new skip takes the flank there, or the target's top when the
predecessor drawing shows the target left of the source. A connection between a frame and a part inside it is the frame's own:
it leaves the rule drawn under the frame's title down into the part, or the
part's bottom face down onto the frame's bottom, never the frame's outer
flank or its outer top edge (the 2026-09-15 evaluation batch drew a frame's
call into its child from the page margin, and a line from the outer top edge
reads as arriving from outside the frame). The compound layout owner gives ELK measured room between cards and route
tracks, then places labels on clear horizontal or vertical runs. Labels do not
start with a reserved vertical passage that forces extra bends.

`lib/layout/compound.ts` runs that graph and exposes one `ArchitectureDrawing`.
Missing cards, routes, or label geometry fail the render rather than silently
dropping subjects. A shared worker serializes concurrent requests and keeps the
process alive only while requests are pending. The pinned ELK package patch fixes
an optional-children TypeScript declaration and preserves supplied label positions
when the interactive engine creates its internal label nodes. Without the latter,
incremental placement sends label routes toward the origin, producing long detours.
The patch keeps route hints in the engine's coordinate system and lets flexible
route lanes use available space before displacing cards. Fully interactive
ordering keeps flat routes consistent; connections crossing containment use
ELK's hierarchy-aware sweep with semi-interactive card ordering instead.

Labels remain upright. The layout owner chooses the longest clear eligible span,
leaving 24 pixels at each end and retaining clearance from cards, other labels,
and unrelated routes. Stable subject and segment ordering breaks ties. If a label
cannot fit, the next engine solve reserves space for that label. Each retry adds
reservations, so the measured label count bounds the process; reserved engine
boxes provide the fallback. The renderer returns only the complete drawing.
Painting and the atlas consume its final boxes and routes.

Flank route hints reserve room for the measured badge beside intersecting route
guides. If clearance requires a wider corridor, the whole guide moves with its
label, avoiding a short sideways jog around the badge.

`lib/svg/architecture.ts` paints the supplied drawing. It does not fit text,
move cards, or choose new route corridors. At clear perpendicular crossings,
the later-painted connection receives a small semicircular bridge from `lib/layout/crossings.ts`.
Nearby crossings share a raised section; shared endpoints, collinear overlaps,
and crossings too close to labels, cards, corners or other routes remain untouched.
Narrow SVG masks clear lower ink by 1.5 drawing units on each side of the upper arc,
revealing the actual container background without a painted patch.
Lines, traffic, selection halos and the atlas all consume
the bridged curve, and exports retain the same treatment.
The atlas uses those same boxes and curves, with
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
receive placement seeds beside their nearest stable dependencies. Connected new
cards share a free lane and align their attachment positions, so an unrelated
card at the far side of the drawing cannot push the whole addition outward.
A branch leaves measured room for its horizontal badges beside inherited route
corridors; the same free-space calculation handles cards and badge clearance.
A new leaf without its own stable anchor follows its connected new neighbor.
A flank skip reaches a west face along the target's own row; once every card
is seeded, a skip whose approach would run through a card in that row (a new
card placed beside its dependencies in the row of a removed one, in the
2026-09-15 batch) is reseated as a plain descent from the source's bottom face
to the target's top, which the engine routes between rows.
ELK still owns collision-free spacing, routes, and any required label reservations.
An unchanged layout reuses its predecessor geometry exactly.

Card placement is the continuity priority. Labels do not retain historical
positions: they are placed around the current attachments and available route
space. Connections may change their routes to preserve card alignment and
clearance; useful old route hints are starting suggestions, not locks.

This preserves the diagram's reading order and familiar columns rather than
promising absolute pixel locks: inserting a stage or growing its text can move
nearby cards to make space. The viewer preserves the camera across variant
changes, including uncached requests, so a new fit does not disguise that
continuity. A different board, view, or walkthrough focus fits afresh; explicit
Fit shows the full selected drawing.

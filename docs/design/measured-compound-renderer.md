# Measured compound renderer

> History. This describes the compound renderer before
> [ADR 0033](../adr/0033-graphviz-placement-and-obstacle-routing.md) and
> [ADR 0040](../adr/0040-track-and-blocks-replace-the-graphviz-engine.md). The
> files it names under `lib/layout/` are gone. Track and Blocks now run in
> `crates/archboard-layout`, as
> [ADR 0057](../adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md)
> describes.

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

Every board is solved reading down the page. A tall board is also folded into
side-by-side columns (`lib/layout/column-readings.ts`). Whether the fold is
kept follows ADR 0039's guard: it is weighed as before the ADR (a twentieth
more fit and a higher score) and on its reading pick (a twentieth more fit and
no more defects), and where the two disagree the reading pick is taken only if
it is no worse on every measure the ADR orders.
The document carries `data-reading-direction`. The conventions below are
stated in that frame.

`lib/layout/compound-graph.ts` translates semantic containment to an ELK hierarchy.
Cards have measured dimensions; frames reserve their measured header and inset
space for children. Consecutive forward connections use bottom/top ports and
returns use the right. A forward skip beside its source's one chain, from a
card that is not a hub, brackets that chain from the left; every other skip
gets no port and the engine attaches it where its own columns fit, which is
what keeps a hub from fanning lanes down the margin
([layout-rules.md](layout-rules.md)). A relationship between a frame and a
card outside it gets no port either, since a fixed face on a frame crashes
the engine once a proposal pins the cards. Under a predecessor a surviving
relationship keeps the faces it was drawn with; a relationship the proposal
adds is settled twice, with the faces a first render of the same content
gives it and with no port, and the drawing with no route through a card and
then fewer bends is kept (`lib/layout/proposal-skips.ts`). A connection between a frame and a part inside it is the frame's own:
it leaves the rule drawn under the frame's title down into the part, or the
part's bottom face down onto the frame's bottom, never the frame's outer
flank or its outer top edge (the 2026-09-15 evaluation batch drew a frame's
call into its child from the page margin, and a line from the outer top edge
reads as arriving from outside the frame). The compound layout owner gives ELK measured room between cards and route
tracks, then places labels on clear horizontal or vertical runs. Labels do not
start with a reserved vertical passage that forces extra bends.
A leg into a card that steps sideways by less than a badge, because the
engine placed the lane and the port apart, has its port slid onto the lane when
the face still holds it and no other run lies within a lane of the leg
(`lib/layout/jogs.ts`).

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
Two routes that finish on one row, each turning toward the other's card, cross
inside their corners where no bridge fits; `lib/layout/folded-crossings.ts` first
exchanges their two lanes, with any label riding a lane, so the crossing lands on
straight runs and is bridged like any other. It does so only when nothing else is
between the lanes and nothing comes closer to anything than routing and labels allow.
Narrow SVG masks clear lower ink by 1.5 drawing units on each side of the upper arc,
revealing the actual container background without a painted patch.
Lines, traffic, selection halos and the atlas all consume
the bridged curve, and exports retain the same treatment.
Where two routes join or part on a shared lane, `lib/svg/junctions.ts` marks
the join with a dot in the heavier line's ink, as a circuit diagram does
(TASK-337). The marks are found from the finished routes. Two stretches whose
strokes touch count as one lane, because routing may nudge a shared lane's
routes a unit apart. Routes that only end at one point, or turn together, are
not marked. The marks move nothing, and a picture transition hides them until
its lines have landed.
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
A relationship the proposal adds is not reseated after seeding: the choice
between its two settled drawings is what keeps it out of the pinned cards.
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

---
status: accepted
---

# Containment and type own distinct visual channels

[ADR 0038](0038-groups-gather-and-colour-their-cards.md) supersedes this
decision in part. A card's body color now comes from the group it is placed
with. A container no longer establishes a color scope for its contents. Type
independence, the icon chip, and the relationship, comparison and selection
channels stand.

[ADR 0044](0044-cards-containers-and-groups-are-drawn-as-slabs.md) supersedes
two more sentences. A comparison status no longer overrides the border of a
node, and arrowheads are no longer proportionate to stroke width. The amendment
of 2026-10-06 at the end says what is true now.

TASK-339 amended this decision on 2026-09-24. A colored line gets its color from
its relationship type or its comparison status. The renderer draws that line at
three quarters of its color over the page, and its arrowhead gets the same
treatment. The renderer mixes the color and does not make it translucent. Two
lines that share a lane (a passage where lines run) therefore draw no darker
where they overlap.

Some parts of a line keep more color. The comets of its traffic carry the color
at full strength (ADR 0027). The comparison band behind a changed line also
keeps the full color. The neutral line keeps its color.

An API that migrates from legacy IIS into Kubernetes must visibly change its
hosting context. It must remain recognizable as an API. Card bodies communicate
containment, icon chips communicate node type, and comparison and selection use
separate visual channels. TASK-203 accepted these rules on 2026-09-13.

[CONTEXT.md](../../CONTEXT.md#the-surface) defines card, container and icon
chip. Emphasis and comparison status are also glossary terms. Color scope was a
glossary term until ADR 0038 removed it. The decisions below govern how a
drawing combines those concepts.

## Type is independent of depiction

A Kubernetes node keeps the same semantic type on an overview and a detailed
board. Choose its depiction from the children present in the final rendered
content. Do not require authors to change its kind to obtain a container shape.

"Present" includes removed children restored for a comparison, so their former
parent can still render as a container. A view that shows only the parent
renders it as a card. Both containers and cards display their type's icon chip.

## Mandatory containment color

A rendered container with a configured type color uses that color for its border
and restrained background tint. It also establishes that color for its contents.
This propagation is automatic. An opt-in feature will be too easy for consumers
and authoring agents to miss. A nearer colored container wins over a distant
one.

A container without a configured color inherits the nearest enclosing color
scope and passes it through. A leaf card uses its enclosing scope's color. A
body with no applicable color scope is neutral. A leaf's type color does not
establish a body color scope only because its icon chip has that color.

The node type independently determines the icon, icon color, icon-chip border
and icon-chip background tint. An uncolored type has a neutral chip. Unknown
configured references follow the explicit neutral fallback in
[ADR 0026](0026-vault-diagnostics-drive-cli-and-agent-repair.md).

| Depiction inside blue Azure                | Body border and tint | Icon chip        |
| ------------------------------------------ | -------------------- | ---------------- |
| Kubernetes card, no visible children       | Azure blue           | Kubernetes green |
| Kubernetes container with visible children | Kubernetes green     | Kubernetes green |
| API card inside Kubernetes                 | Kubernetes green     | API type color   |
| Uncolored container inside Kubernetes      | Kubernetes green     | Neutral          |

Kubernetes can instead be inside yellow AWS. This needs no change to its own
type and no platform tag. Group memberships are not an alternative source of
color scope. Structural containment supplies the membership that this decision
communicates.

## Relationship, comparison and selection

Relationship type determines optional curated color, solid/dashed/dotted line
pattern, and filled/open/absent arrowhead shape. Author-supplied emphasis
determines line weight only. Arrowheads remain proportionate to stroke width.
Emphasis no longer makes an edge white or adds motion. The sequence grammar's
message semantics remain distinct from these architecture relationship types.

Added, changed and deleted comparison status overrides the semantic border on
nodes and the semantic line color on edges. Node background tint and type chips
continue to explain semantic meaning. Selection adds an outer ring or edge
highlight rather than replacing the comparison treatment.

Traffic is a separate optional connection property. Nothing infers it from
emphasis. [ADR 0027](0027-explicit-traffic-controls-distance-based-animation.md)
records its settled requirements and remaining design questions.

## Explain the appearance

The browser provides a visible-by-default, hideable legend that explains the
applied appearance. The legend must have clear hierarchy and ample space, and
must not sacrifice aesthetics for compactness. Exported diagrams have no legends
for now.

The user's decision of 2026-09-27 amended this. The inspector no longer has a
section that explains the selected subject's colors, because a user can see them
("Users have eyes... usually."). The legend is the one explanation.

Separating these channels makes a hosting migration readable without losing
type, change or selection information. If a view changes a node from a leaf card
to an expanded container, the separation intentionally permits its body
appearance to change. Semantic identity and type remain unchanged.

## Amendment of 2026-10-06: a standing is on the face, and a head has a set length

ADR 0044 draws every part as a slab, with a top face and a front edge. Two
sentences of "Relationship, comparison and selection" no longer hold.

"Arrowheads remain proportionate to stroke width." An arrowhead now takes its
length from one table, `HEAD_LENGTH` in
`src/transformers/semantic-renderer/lib/svg/styles.ts`. A head is 11 units long
on an emphasized line, 11 on a default line and 6 on a muted line. The owner
asked for this on 2026-10-06 (TASK-403). A smaller default head left the reader
to guess which way most lines run. TASK-404 then gave a muted line a head of
the same length, so every head is 11 units long. A colored line is now drawn
in its full color on the light ground and at three quarters on the dark
ground (ADR 0044, rule 12).

"Added, changed and deleted comparison status overrides the semantic border on
nodes and the semantic line color on edges." The part about edges holds. On a
node, a standing now washes the face: green for added, and orange with a hatch
for changed. A card keeps the color of its group on its front edge. A
container keeps the color of its kind on its nameplate, and the wash lies on
the plinth's face below the nameplate. A removed
node has lost its thickness: a flat, see-through face inside a dashed red
footprint. The type chip still says the kind, and selection still adds a ring
outside the part.

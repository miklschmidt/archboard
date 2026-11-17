---
status: accepted
---

# Containment and type own distinct visual channels

[ADR 0038](0038-groups-gather-and-colour-their-cards.md) supersedes this
decision in part. A card's body color now comes from the group it is placed
with. A container no longer establishes a color scope for its contents. Type
independence, the icon chip, and the relationship, comparison and selection
channels stand.

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

The node type independently determines the icon, icon color, icon-chip border
and icon-chip background tint. An uncolored type has a neutral chip. Unknown
configured references follow the explicit neutral fallback in
[ADR 0026](0026-vault-diagnostics-drive-cli-and-agent-repair.md).

## Relationship, comparison and selection

Relationship type determines optional curated color, solid/dashed/dotted line
pattern, and filled/open/absent arrowhead shape. Author-supplied emphasis
determines line weight only. The sequence grammar's
message semantics remain distinct from these architecture relationship types.

Added, changed and deleted comparison status overrides the semantic border on
nodes and the semantic line color on edges. Node background tint and type chips
continue to explain semantic meaning. Selection adds an outer ring or edge
highlight rather than replacing the comparison treatment.

Traffic is a separate optional connection property. Nothing infers it from
emphasis. [ADR 0027](0027-explicit-traffic-controls-distance-based-animation.md)
records its settled requirements.

Separating these channels makes a hosting migration readable without losing
type, change or selection information. If a view changes a node from a leaf card
to an expanded container, the separation intentionally permits its body
appearance to change. Semantic identity and type remain unchanged.

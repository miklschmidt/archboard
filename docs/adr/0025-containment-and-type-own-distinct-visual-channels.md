---
status: accepted
---

# Containment and type own distinct visual channels

An API migrating from legacy IIS into Kubernetes should visibly change its hosting
context while remaining recognizable as an API. Card bodies communicate containment,
icon chips communicate node type, and comparison and selection use separate visual
channels. These rules were accepted in TASK-203 on 2026-09-13.

Card, container and icon chip are defined in [CONTEXT.md](../../CONTEXT.md#the-surface);
emphasis, color scope and comparison status are also glossary terms. The decisions
below govern how those concepts are combined in a drawing.

## Type is independent of depiction

A Kubernetes node keeps the same semantic type on an overview and a detailed board.
Choose its depiction from the children present in the final rendered content,
rather than requiring authors to change its kind to obtain a container shape.

“Present” includes removed children restored for a comparison, so their former
parent can still render as a container. A view showing only the parent renders it
as a card. Both containers and cards display their type's icon chip.

## Mandatory containment color

A rendered container with a configured type color uses that color for its border
and restrained background tint, and establishes that color for its contents.
This propagation is automatic: an opt-in feature would be too easy for consumers
and authoring agents to miss. A nearer colored container wins over a distant one.

A container without a configured color inherits the nearest enclosing color scope
and passes it through. A leaf card uses its enclosing scope's color. A body with
no applicable color scope is neutral. A leaf's type color does not establish a
body color scope merely because its icon chip has that color.

The node type independently determines the icon, icon color, icon-chip border and
icon-chip background tint. An uncolored type has a neutral chip. Unknown configured
references follow the explicit neutral fallback in
[ADR 0026](0026-vault-diagnostics-drive-cli-and-agent-repair.md).

| Depiction inside blue Azure                | Body border and tint | Icon chip        |
| ------------------------------------------ | -------------------- | ---------------- |
| Kubernetes card, no visible children       | Azure blue           | Kubernetes green |
| Kubernetes container with visible children | Kubernetes green     | Kubernetes green |
| API card inside Kubernetes                 | Kubernetes green     | API type color   |
| Uncolored container inside Kubernetes      | Kubernetes green     | Neutral          |

Kubernetes can instead be inside yellow AWS without changing its own type or
requiring a platform tag. Group memberships are not an alternative source of color
scope; structural containment supplies the membership being communicated here.

## Relationship, comparison and selection

Relationship type determines optional curated color, solid/dashed/dotted line
pattern, and filled/open/absent arrowhead shape. Author-supplied emphasis determines
line weight only; arrowheads remain proportionate to stroke width. Emphasis no
longer makes an edge white or adds motion. The sequence grammar's message semantics
remain distinct from these architecture relationship types.

Added, changed and deleted comparison status overrides the semantic border on
nodes and the semantic line color on edges. Node background tint and type chips
continue to explain semantic meaning. Selection adds an outer ring or edge
highlight rather than replacing the comparison treatment.

Traffic is a separate optional connection property, never inferred from emphasis.
Its settled requirements and remaining design questions are in
[ADR 0027](0027-explicit-traffic-controls-distance-based-animation.md).

## Explain the appearance

The browser provides a visible-by-default, hideable legend and inspection that
explains the applied appearance. The legend must have clear hierarchy and ample
space rather than sacrificing aesthetics for compactness. Exported diagrams have
no legends for now.

Separating these channels makes a hosting migration readable without losing type,
change or selection information. It intentionally permits a node's body appearance
to change when a view changes it from a leaf card to an expanded container; semantic
identity and type remain unchanged.

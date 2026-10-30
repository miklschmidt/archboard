---
status: superseded by ADR-0040
---

# Graphviz places architecture cards, and libavoid routes their relationships

On 2026-09-19, the user requested adoption of the Graphviz prototype that
TASK-278 investigated. Treating each container as one outer layer kept outside
cards away from the children that they connect to. It also produced large empty
regions and long routes. Graphviz's global ranking across clusters lets those
cards share the container's vertical span. It still preserves semantic
containment.

Graphviz owns placement. libavoid owns orthogonal routing around measured cards
and container title bands. A relationship can enter only a container that holds
one of its endpoints. Other container bodies are routing obstacles. This design
does not use Graphviz's own orthogonal routes, because the prototype showed that
they can cross headings or meet constrained endpoints diagonally.

Relationship labels use clear runs of their routes. A label that cannot fit
requests measured space from the layout owner.

Cards expose shared ports per relationship kind on their faces. Different kinds
use distinct physical attachment positions and native lane separation. A lane is
a passage where lines run. Shared mixed-type runs proved ambiguous, so this
readability requirement followed. The router owns face choice and paths. Ports
are not private to each edge. Endpoint clearance must still accommodate the
actual arrowhead and a rounded bend.

Labels try natural route runs after placement space is reserved. They become
waypoints only after that still cannot fit their words.

The user explicitly rejected importing constraints absent from the prototype
during adoption.

The same implementation runs in workers under Bun and in the browser. The host
loads the two WebAssembly engines. Semantic content, measured text and layout
geometry retain one owner. SVG painting and the interaction atlas consume the
same final geometry. Nothing authors or persists engine coordinates.

This supersedes ADR 0028's choice of ELK and its engine-specific attachment
conventions. Containment, endpoint identity, readable labels, measured text, and
deterministic fresh top-to-bottom layouts remain the contracts.

The user rejected automatic left-to-right readings during live verification. The
design therefore removed the fit-based direction selection and transposition
machinery. ADR 0032 continues to govern proposals. Predecessor positions do not
constrain placement, while subject identities and Standing preserve comparison
meaning.

[shared-container-rows.md](../design/shared-container-rows.md) records the
experiment and the measured adoption results.

Superseded (2026-09-27,
[ADR 0040](0040-track-and-blocks-replace-the-graphviz-engine.md)): ADR 0040
removes the Graphviz engine, and Track and Blocks lay out every board. Graphviz
still places their cards. libavoid still routes Blocks' trunks.

Superseded in part (2026-10-25, TASK-520.02,
[ADR 0059](0059-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md)):
the router of the renderer core routes Blocks' trunks, and libavoid-js is gone
from the repository.

---
status: accepted
---

# Graphviz places architecture cards; libavoid routes their relationships

On 2026-09-19 the user requested adoption of the Graphviz prototype investigated
in TASK-278. Treating each container as one outer layer kept outside cards away
from the children they connect to and produced large empty regions and long
routes. Graphviz's global ranking across clusters allows those cards to share
the container's vertical span while preserving semantic containment.

Graphviz owns placement. libavoid owns orthogonal routing around measured cards
and container title bands. Graphviz's own orthogonal routes are not used: the
prototype showed that they could cross headings or meet constrained endpoints
diagonally. Relationship labels use clear runs of their routes; a label that
cannot fit requests measured space from the layout owner.

Cards expose shared ports per relationship kind on their faces. Different
kinds use distinct physical attachment positions and native lane separation,
a readability requirement added after shared mixed-type runs proved ambiguous.
The router owns face choice and paths; ports are not private to each edge. Endpoint clearance must still accommodate the
actual arrowhead and a rounded bend. Labels try natural route runs after placement
space is reserved, and become waypoints only when that still cannot fit their
words. The user explicitly rejected importing constraints absent from the
prototype during adoption.

The same implementation runs in workers under Bun and in the browser. The
host loads the two WebAssembly engines; semantic content, measured text and
layout geometry retain one owner. SVG painting and the interaction atlas consume
the same final geometry. Engine coordinates are never authored or persisted.

This supersedes ADR 0028's choice of ELK and its engine-specific attachment
conventions. Containment, endpoint identity, readable labels, measured text,
deterministic fresh top-to-bottom layouts remain the contracts. The user
rejected automatic left-to-right readings during live verification, so the
fit-based direction selection and transposition machinery were removed. ADR 0032 continues to govern proposals: predecessor positions do not
constrain placement, while subject identities and Standing preserve comparison
meaning.

The experiment and measured adoption results are recorded in
[shared-container-rows.md](../design/shared-container-rows.md).

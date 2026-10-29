---
status: proposed
---

# Blocks keeps legacy placement and plans its routes

TASK-554 proposes this decision on 2026-10-28 and revises it on 2026-10-29.
The owner selected the hybrid direction after three iterations failed to improve the six reference pictures with planner-owned placement.
The legacy placer composes the boards better, while planned routing supplies explicit ownership, complete geometry guards, and bounded search.

Legacy Blocks placement owns card positions, dependency order, packing, frames, folds, and wraps.
The planner replaces Blocks routing, including the old trunk router and its unrestricted grid search.
The placer can respond to the new routes with smaller gaps.
A placement change must preserve the reading order and pass the per-reference gates.
Dense scopes use a smaller wrap search, and Blocks omits the repeated side-exit hierarchy pass.

The planner routes fixed measured geometry through four-wall ports, private lanes, and explicit source and target fans.
Every shared run names one endpoint common to all its members and preserves the full line treatment.
Pairwise compatibility alone cannot establish trunk ownership.
A source fan only splits, and a target fan only merges.
Local conflict repair and grid windows have explicit work limits.
A failed candidate can request bounded extra room from the legacy placer.
No unchecked route reaches the painter.

Each label belongs to one real relationship and receives no semantic node ID or arrowhead.
It occupies the midpoint of the longest clear private run that holds its measured plate.
When no qualifying midpoint exists, it occupies the nearest clear private spot along the route from the source.
The implementation counts those cases.
Words remain horizontal on horizontal or vertical runs.
A stack of separate label plates uses a vertical run long enough to carry every plate.
The label never covers shared ink, crosses a frame wall, or lies under a foreign line.
A route never gains a bend to reach a label slot.

The complete geometry guard protects cards, headers, captions, walls, labels, endpoints, and fan ownership before emission.
The painter measures actual decorated ink for page bounds.
Planned crossing decoration retains its finite search limits.
The Solver interface, text shaping, Rust core, worker pool, and Graphviz remain under ADRs 0059 and 0060.
Track retains its existing behavior and must remain byte-identical.
ADRs 0033, 0040, 0061, and 0062 retain their placement and measured-header decisions.

The original proposal replaced placement as well as routing.
Step 8 removed all twenty-three baseline geometry findings and met the three speed budgets.
It still increased mean area and route length.
Iteration 3 rejected its readability trials because none passed all six references.
The hybrid removes that planner-owned placement and keeps its useful routing and guard contracts.

The [design](../design/blocks-planned-layout.md) records the work limits, historical trials, and acceptance gates.
This decision remains proposed until corpus, speed, and visual acceptance are complete.

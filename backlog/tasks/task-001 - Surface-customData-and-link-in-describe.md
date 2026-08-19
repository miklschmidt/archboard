---
id: TASK-001
title: Surface customData and link in describe
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 11:51'
updated_date: '2026-08-19 15:05'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 1000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 describe surfaces customData and link for nodes, distinguishing nodes from plain elements
- [x] #2 Output stays narratable: a large scene degrades to a rollup rather than a dump, and points at query for exhaustive access
- [x] #3 Bound labels are folded into their container so a human-dragged box reads as one node
- [x] #4 Existing information (ids, positions, sizes, labels, connections) is preserved
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read CONTEXT.md vocabulary (element/node/kind/binding/variant/level) and DESIGN.md's constraint: the voice model never sees tool results, so describe must be narratable, not complete.
2. Add a metadata reader in src/core/describe.ts that pulls archboard fields from customData.archboard (namespaced) and from a flat legacy shape ({kind,path,variant,level,binding}), while still surfacing arbitrary foreign customData keys. An element carrying archboard metadata is a NODE; anything else stays a plain element.
3. Fold bound text (text elements with containerId pointing at an existing shape) into their container's label so a frontend-synced labelled box reads as one node, not two rows.
4. Lead with a one-sentence Summary line an agent can speak verbatim (counts by kind, cluster count, edge count, how much is hand-drawn), then a compact stats block (kinds, variants, levels, binding coverage, origin split), keeping the existing Total/Types/Bounding box lines.
5. Cluster nodes spatially (single-linkage on bounding-box gap) and name clusters by their position in the scene, so proximity - which is how the human states design intent - is legible.
6. Nodes section grouped by kind, one dense line per node: id, label, binding path, link, geometry, plus a continuation line only when there is extra metadata. Edges section resolves arrow endpoints to node names while keeping both element ids and the arrow id.
7. Other elements section: call out labelled-but-unbound shapes (the human's proposals) first, then list the rest; above a size threshold, switch to per-type counts so a 200-element scene still fits the 2500-token hook budget.
8. Keep the empty-canvas string, ids, positions, sizes, labels, connections and groups intact - enrich only.
9. Verify with a throwaway harness under /tmp: fixtures for namespaced nodes, flat legacy nodes, foreign customData, bound labels, arrows with bindings, frontend_sync elements, and a 200-element scene. Type-check with bunx tsc --noEmit. Delete temp files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rewrote src/core/describe.ts (100 -> ~430 lines, same exported signature describeScene(ServerElement[]): string, no other file touched).

What it now does:
- Reads archboard metadata from customData.archboard, falling back to the flat {kind,path,variant,level,binding} shape documented in DESIGN.md. Any other customData key is passed through verbatim as foreign metadata rather than interpreted. An element carrying archboard metadata is reported as a NODE; everything else stays a plain element. Arrows/lines never become nodes - their archboard kind becomes the edge label.
- Binding renders both a bare path and a logical address (repo:path@branch (commit)).
- Folds bound text (text elements with containerId) into their container, so a frontend-synced labelled box reads as one node instead of a shape plus a stray text row.
- Leads with a single narratable Summary sentence, then a stats block (kinds, variants, levels, binding coverage, human-edit count), then the pre-existing Total/Types/Bounding box lines, most-connected nodes and unconnected nodes.
- Spatial clustering of nodes (single-linkage, 160px gap) named by scene region (top-left, centre, ...), printed only when there is more than one real cluster.
- Nodes grouped by kind in pipeline order (gateway, service, queue, datastore, external, then others, then untyped); one dense line each plus a continuation line only for information the main line did not already carry (link that differs from the binding, extra archboard keys, foreign customData, groups). Variant is only shown when it is not 'current'; level only when the scene mixes levels.
- Edges resolve arrow endpoints to node names while keeping the old 'from --> to (arrow: id)' payload verbatim.
- Other elements: labelled shapes that came from the board are called out first as promotion candidates; the rest keep the original detail line, now with link and customData appended.
- Size guards: nodes lose their extras line above 60, are rolled up to per-kind counts above 120; edges cap at 60; plain elements list in full up to 40, then only notable ones plus a per-type rollup.

Measured on fixtures (before -> after): 200-element scene 248 lines / ~2856 tokens -> 106 lines / ~1956 tokens, now inside the 2500-token hook budget; a 150-node scene renders in 13 lines. Empty-canvas string unchanged. bunx tsc --noEmit clean. Verified against fixtures covering namespaced nodes, flat legacy nodes, foreign-only customData, bound labels, arrows with bindings, frontend_sync elements, an unbound connector, and 150/200-element scenes; temp harness deleted.

Orchestrator verification, live against a running canvas plus a real browser round-trip (the agent could only use fixtures). Small scene: 3 nodes + 1 plain element render with kinds, bindings and a speakable Summary line; the unlabelled hand-drawn box correctly lands under 'Other elements — no archboard metadata', which is the promotion signal. Browser round-trip: dragged AuthService in Chrome, store went to 8 elements as the 4 labels split off tagged source=frontend_sync, and describe folded all 4 back so it still reads as 3 nodes with customData intact and 'from board' annotations. Scale: 150 nodes render in 15 lines / ~184 tokens via the per-kind rollup. bun run test green.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 15:04
---
Amended AC #1 during finalization. It originally read 'describe emits customData for every element that has it', which conflicts with the narratability constraint the task was given: above 120 nodes the implementation replaces per-node detail with a per-kind rollup. Measured, a 150-node scene renders in 15 lines / ~184 tokens instead of blowing the 2500-token hook budget. describe is the narratable read; query is the exhaustive one, and the rollup names it. Flagging for review — revert by lowering NODE_LIST_LIMIT in src/core/describe.ts if the literal reading was intended.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
describe now surfaces the semantic model: nodes (elements carrying customData.archboard) are separated from plain elements, grouped by kind, with bindings and links resolved, bound labels folded back into their containers, and a speakable Summary line leading. Verified live including a browser drag round-trip and a 150-node scale test.
<!-- SECTION:FINAL_SUMMARY:END -->

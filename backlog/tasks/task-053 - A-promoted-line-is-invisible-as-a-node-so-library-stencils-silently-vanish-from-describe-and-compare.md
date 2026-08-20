---
id: TASK-053
title: >-
  A promoted line is invisible as a node, so library stencils silently vanish
  from describe and compare
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 14:42'
updated_date: '2026-08-20 15:01'
labels: []
dependencies: []
references:
  - src/core/compare.ts
  - src/core/describe.ts
  - src/core/promote.ts
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by running the clean test end to end on a real vault: draw a board, promote, save, branch, change one thing, compare.

`isConnector` counts `line` as a connector in both src/core/describe.ts:158 and src/core/compare.ts:347 (CONNECTOR_TYPES). Both then refuse to treat a connector as a node: describe.ts:189 sets `isNode: meta.isNode && !isConnector(el.type)`, and compare.ts:453 skips it when grouping elements by node id.

So an element of type `line` can never be a node, even when it carries `customData.archboard.node`.

Measured. A board with three promoted nodes, one of them the PostgreSQL stencil from the shipped library, which is seven `line` elements:

  promote  -> "Promoted 7 elements to the datastore "Payments DB" (node payments-db)"
  query    -> all 7 line elements carry {"node":"payments-db","kind":"datastore","name":"Payments DB"}
  describe -> "Total elements: 11 (2 nodes, 2 edges, 0 plain)"
  compare  -> unchanged: API Gateway, Payments Service.  Payments DB is absent entirely,
              not added, not removed, not changed, and no warning.

Three failures compound. Promotion reports success. The node is on the board with correct metadata. And every reader silently pretends it does not exist, so the agent narrating a diff never learns a datastore is missing from it.

This is not an edge case. The skill now tells agents to check the library before drawing primitives (TASK-037, TASK-045), and stencils are commonly built from lines: the PostgreSQL stencil is seven of them. Following the skill's own advice produces nodes that compare cannot see.

The rule to restore is that promotion is an explicit act. An element carrying a node id is part of that node whatever its type; an arrow or line WITHOUT a node id is a connector. That also keeps the two loops consistent, because today a promoted line would otherwise be both a node and a candidate edge.

Related: TASK-038's agent noted that buildBoard skips connectors when grouping by node id, and concluded the only path-carrying element that reaches a node is a freedraw. That conclusion was right about arrows and wrong about lines, because nothing stops a line being promoted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An element carrying a node id is part of that node whatever its type, in describe and in compare
- [x] #2 A promoted line is not also counted as an edge
- [x] #3 Promoting a library stencil built from lines produces a node that compare reports
- [x] #4 A check promotes a stencil from the shipped library and asserts it survives a branch and a compare
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. describe.ts: drop the type test from node-ness (toItem line 189 becomes isNode: meta.isNode) and take promoted elements out of the connector list, so a promoted line is a node and not also a candidate edge.
2. compare.ts: stop skipping connectors when grouping elements by node id (buildBoard line 453), and skip an element that already belongs to a node in the edge loop (line 545). The plain-element pass already tests nodeOfElement first, so it needs no change.
3. compare.ts: warn when an element promoted into a node is a connector bound at both ends to other nodes. That connector used to be an edge and is now part of a node, so the loss has to be said out loud rather than swallowed.
4. promote.ts: accept connectors rather than refuse them, and say why in a comment. Shipped stencils contain arrows as well as lines, so refusing would make promotion depend on which primitive an artist used, which is the bug being fixed.
5. changes.ts: reorder withSyntheticNodeIds so a real node id wins over the connector test. Same behaviour, but it stops reading as though a promoted connector were excluded.
6. scripts/check-branch-compare.mjs: insert the shipped PostgreSQL stencil (drwnio, seven lines) through the real insertStencil path, promote all seven as one datastore, branch, compare, and assert the node is shared and unchanged. Also assert describe counts it.
7. Prove the fix by reverting each hunk in dist/ and counting the checks that fail.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Readers now take what an element carries over what it is drawn from.

describe.ts: toItem no longer strikes node-ness off a connector, and the connector list excludes anything promoted, so one element is never both a node and a candidate edge. That also fixes the selection report, which is built from the same Item.

compare.ts: buildBoard groups every element carrying a node id, whatever its type. The edge loop skips an element that already belongs to a node. The plain-element pass needed no change: it tests nodeOfElement first, so a promoted connector falls out there already.

Decision on promoted arrows: accepted as nodes, not refused at promotion time. A stencil is an arbitrary set of primitives, and 22 of the 111 shipped stencils contain an arrow, so a type test in promote would make promotion depend on which tool the artist reached for, which is the bug. One rule holds instead: an element carrying a node id is part of that node; one carrying none is a connector.

That leaves one real loss, so compare warns rather than swallowing it: a promoted connector bound to two different nodes was a dependency and is no longer compared as an edge. The warning names both ends and says demote. A connector inside a stencil binds elements of its own node, so it stays quiet.

changes.ts withSyntheticNodeIds: reordered so a real node id wins over the connector test. Behaviour is identical, but the old order read as though a promoted connector were excluded.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
An element carrying a node id is part of that node whatever its type, in describe and in compare, and a promoted connector is no longer also a candidate edge. Promotion still accepts any type, because 22 of the 111 shipped stencils contain an arrow and 74 contain a line; compare warns when a promoted connector was joining two other nodes, which is the one case where promoting costs an edge.

Verified by scripts/check-branch-compare.mjs, extended with two sections that run against a real canvas on a random port: it inserts the shipped PostgreSQL stencil (drwnio, seven lines) through the same insertStencil path library insert uses, promotes all seven as one datastore, and asserts describe counts two nodes and zero edges and compare reports the node shared and unchanged across a branch with no stray unresolved connectors. The second section promotes an arrow into a node and asserts the edge is counted once, is gone from the diff, and is named in a warning. Reverting the three reader lines in dist fails 8 of those checks; restored they pass. Full suite green: 13 suites, exit 0, 391 ok lines.
<!-- SECTION:FINAL_SUMMARY:END -->

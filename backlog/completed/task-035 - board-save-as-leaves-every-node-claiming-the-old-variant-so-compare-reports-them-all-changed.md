---
id: TASK-035
title: >-
  board save --as leaves every node claiming the old variant, so compare reports
  them all changed
status: Done
assignee:
  - '@claude'
created_date: '2026-08-20 02:42'
updated_date: '2026-08-20 03:23'
labels: []
dependencies: []
references:
  - src/core/compare.ts
  - src/core/board.ts
  - src/core/promote.ts
  - TESTING.md
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Branching a proposal with `board save --as <name>@<variant>` copies the elements verbatim. Each node's customData.archboard.variant still records the variant it was promoted under, so on the new board every node disagrees with the board it now sits on.

compare treats that disagreement as a semantic change. src/core/compare.ts:891 emits variantAnomaly for any node whose recorded variant is not the board's own, which is right in principle: it catches a node copied between variants without re-promotion. But save --as is the documented way to make a proposal (TESTING.md step 4), so the check fires on the normal workflow rather than on the mistake it was written for.

Measured on the boards drawn today. archboard/dataflow@no-mcp differs from archboard/dataflow by exactly one thing, the MCP stdio server node and its edge:

  compare archboard/dataflow archboard/dataflow@no-mcp
  nodes: added 0, removed 1, changed 11, unchanged 0
  removed: MCP stdio server (service)
  changed: 11 nodes, every one of them only {"variantAnomaly": {"from": null, "to": "current"}}
  edges:   removed 1, mcp-stdio-server -> rest-and-websocket

Eleven of twelve nodes are reported as changed and none as unchanged. The one real difference is buried in noise, and 'unchanged: 0' is actively misleading to an agent narrating the diff, which is the whole point of the command.

The comment at src/core/compare.ts:525 calls this 'harmless to the diff'. It is not: it is the default outcome of the intended workflow.

Fix direction: save --as should restamp customData.archboard.variant on every node to the variant it is saving as, so variantAnomaly goes back to meaning what it says.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 board save --as <name>@<variant> rewrites customData.archboard.variant on every node of the copy
- [x] #2 compare between a board and a variant branched from it reports only the differences the human made; nodes nobody touched come back unchanged
- [x] #3 variantAnomaly still fires when a node is genuinely copied between boards without re-promotion
- [x] #4 The stale-variant warning at src/core/compare.ts:525 no longer appears for a freshly branched variant
- [x] #5 A check script covers branch-then-compare so this cannot regress silently
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add restampVariant to src/core/promote.ts, next to the code that stamps variant in the first place: given elements and a variant, return copies whose customData.archboard.variant is that variant. Only elements already carrying an archboard block with a node id or a variant are touched; the node id, kind, name and binding are left alone, because those are the join the diff is built on.
2. Call it from POST /api/boards/save in src/server.ts, on the branch where the board is being written under an address that is not its own. Both the note and the copy the store keeps get the restamped elements, and a restamped element is a new object, so the board it was branched from is unchanged. A plain save leaves node variants alone, so a node genuinely pasted in from another board still records where it came from and compare still reports it.
3. Correct the comment at src/core/compare.ts:525. The disagreement is not harmless to the diff: variantAnomaly is a semantic field, so every such node is reported as changed.
4. Extend scripts/check-boards.mjs with branch-then-compare, and with a node copied between boards that still has to report variantAnomaly. It runs after both panes close, because board new needs a pane named when two are open.
5. Note the behaviour in CLAUDE.md next to the addressing rules.
6. bun run test, plus a negative control: patch the restamp back out of dist and confirm the new checks fail.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified against a real canvas server on a random high port, with a three-node board saved, branched with save --as, and one node deleted on the branch.

AC1: after 'save --as ledger@option-a' every element on the copy records variant 'option-a' (checked over the API and in the note on disk, which holds three "variant": "option-a" and no "current"). The board it was branched from still records 'current'.
AC2: compare ledger -> ledger@option-a returns nodesRemoved 1 (worker), nodesChanged 0, nodesUnchanged 2. Before the fix the same comparison returned nodesChanged 2, each change only {variantAnomaly: {from: null, to: 'current'}}, and nodesUnchanged 0.
AC3: a node with variant 'current' created directly on billing@option-b, a board nobody branched, still comes back as changed with variantAnomaly to 'current'.
AC4: warnings is empty on the branched comparison, and still carries the stale-variant warning on the copied-in one.
AC5: eleven checks added to scripts/check-boards.mjs. Negative control: patching the restamp back out of dist/server.js makes five of them fail.

bun run test exits 0.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
board save --as now restamps customData.archboard.variant on every node of the copy, so a branched proposal is a board of its own variant rather than a copy still claiming the old one. compare between a board and a branch off it reports only what the human changed; variantAnomaly goes back to meaning a node copied in without re-promotion, which is what it was written for. The 'harmless to the diff' comment in compare.ts is corrected, and eleven checks in scripts/check-boards.mjs cover branch-then-compare and the copied-in case that must still fire.
<!-- SECTION:FINAL_SUMMARY:END -->

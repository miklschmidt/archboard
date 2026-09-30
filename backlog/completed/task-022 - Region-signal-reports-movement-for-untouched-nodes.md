---
id: TASK-022
title: Region signal reports movement for untouched nodes
status: Done
assignee:
  - '@claude'
created_date: '2026-08-19 20:02'
updated_date: '2026-08-19 22:31'
labels:
  - needs-triage
dependencies: []
ordinal: 22000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Adding a node at the edge of a board does not report region moves for nodes nobody touched
- [x] #2 Region stays useful for genuine movement
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce: three-node payments board, then the same board with one node added at the right edge; confirm both `changes` and `compare` report region moves for the two untouched nodes.
2. Take BOTH suggested directions, because each covers a cause the other cannot, and neither breaks wholesale rearrangement:
   a. Anchor the region frame to the nodes present on both sides (mirrors the cluster signal, which already restricts to shared ids). Kills the reported cause — a node added or removed at the edge reframing everyone. Stays fully relative, so it works in `compare` where the two variants may be drawn at different origins.
   b. Drop the region field from a node's layout diff when the node's own centre did not move. Region is a function of the centre, so an unchanged centre proves the new region name came from the frame, not from the node. Fires only when the two sides share a coordinate system (live diffing in `changes`, and a variant copied from its sibling), which is exactly where the feed's "X moved" prose is a claim about a human action.
   Wholesale rearrangement is safe under both: every node's centre moves, so nothing is suppressed, and the shared frame is the whole board.
3. Implement: `boundingBoxOf` and `sameCentre` in core/layout.ts; a `regionFrame` on the board model in core/compare.ts computed after the join, with node, cluster and plain-element regions all recomputed against it; suppression in the node loop.
4. Fall back to the full node box when fewer than two nodes are shared, since a degenerate frame names everything 'centre'.
5. Update the region wording: LAYOUT_METHOD.region, LAYOUT_CANNOT_EXPRESS, the boxAspectDiverged warning, the compare.ts header, and the changes.ts caveat that currently documents this bug as intended behaviour.
6. Add regression checks to scripts/check-changes.mjs: the add-at-the-edge case stays silent, a genuine move still reports, and a bystander of a genuine move is not called moved.
7. Verify against the fixture vault on port 3400 through the real `compare` and `changes` paths; run bun run test and bun run type-check; leave the canvas cleared.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Took both suggested directions, because each removes a cause the other cannot reach, and neither weakens a wholesale rearrangement.

**Anchor the frame to the join.** `reframeRegions` in core/compare.ts runs after both sides are built and draws the region frame round the nodes both boards have, exactly as the cluster signal already restricts itself to shared membership. Nodes present on one side only are still placed in that frame — Settlement lands at 'bottom-right' — they just no longer redraw it for everyone else. This is the half that works in `compare`, where two independently authored variants may sit at different origins and nothing absolute is comparable. Below two shared nodes there is nothing to anchor to (one box frames everything as 'centre'), so each side falls back to its own node box and the old caveat stands, now stated explicitly.

**Suppress region when the node's own centre did not move.** `regionName` reads the centre and nothing else, so an unchanged centre is proof that a new region name came from the frame rather than from the node. Fires only when the two sides share a coordinate system — one board a moment later, or a variant copied from its sibling — which is exactly where the feed's 'X moved' prose is a claim about something a human did. A board rearranged wholesale is unaffected: every centre moved, so nothing is suppressed.

Also: `SideSummary` now reports `regionFrame` beside `nodeBox`, so the frame the names are thirds of is visible in the output rather than implied; `boxAspectDiverged` measures the region frames, which is what it was always about.

cannotExpress: the old line ('one far-flung node re-frames every region on that side') was the bug, and is gone. Three lines replace it — the two sides' thirds are still not the same physical place; a node left exactly where it was while the board is rearranged round it now reports no region change (the new blind spot the suppression buys, with a pointer to read the nodes that did move); and the fewer-than-two-shared-nodes fallback, where the original re-framing still applies. LAYOUT_METHOD.region, both file headers and the changes.ts caveat that documented this bug as intended behaviour were rewritten to match.

Verified on the real fixture vault board (payments, six nodes) with Settlement added at the right edge, running the same inputs through a pre-fix copy of the build and the fixed one:

  BEFORE  compare  layout.moved: Fraud Provider region top-right→top-centre | Ledger top-centre→top-left | Payments DB bottom-centre→bottom-left
          changes  - new service "Settlement" / - cluster formed: joined by "Settlement" / - "Fraud Provider" moved: region … / - "Ledger" moved: region … / - "Payments DB" moved: region …
  AFTER   compare  layout.moved: none
          changes  - new service "Settlement" / - cluster formed: joined by "Settlement"

The primary signal survives untouched. Control on the same board, Payment Events genuinely dragged 1200px down: before the fix 'Payments DB moved: … region bottom-centre → top-centre' although nobody touched it; after, that line is gone and every genuine statement about Payment Events — cluster split, sits on its own, three relative-direction changes — is unchanged.

End to end through the CLI on port 3400 against the fixture vault, both notes read from disk: `compare payments payments@edge` → Settlement placed bottom-right, cluster formed, layout.moved none, from.regionFrame maxX 1500 = to.regionFrame maxX 1500 while to.nodeBox maxX 3400. Live `changes --since 0 --coalesce --text` on the canvas reported the arrival and the cluster and nothing else.

Nine regression checks added to scripts/check-changes.mjs covering: added at the edge, deleted from the edge, the arriving node still placed at the right, the frame anchored to the join, a genuine drag still reporting its new region, its bystanders not, a wholesale pan silent, and a wholesale rearrangement still reporting.

bun run test: all suites pass. bun run type-check: clean. Canvas cleared, server stopped, the payments@edge variant written during verification removed from the fixture vault.

Orchestrator verification: reproduced the exact case I originally reported, on the real fixture board. Added one node far to the right of payments and compared. nodesMovedOnly 0, layout.moved none, and the addition still reports. Before the fix this produced three false 'moved' lines for nodes nobody had touched. Full suite green including the new parity check; 9 new region checks in check-changes.mjs.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 20:03
---
Observed while verifying TASK-018: adding Settlement at the right edge of payments expanded the board's node bounding box, so 'Payment Events' and 'Payments DB' both reported region moves despite not being touched. Region is thirds of that board's bounding box, so any node placed outside the current extent reframes everyone.

The primary signal was still correct and useful ('cluster formed: joined by Settlement'), so this is noise rather than a wrong answer, and layout.cannotExpress already discloses that regions are relative to each board's frame. But in the injection path this noise reaches the agent as prose, and 'Payment Events moved' is a false statement about what the human did.

Worth considering: anchor the frame to the shared nodes only, as the cluster signal already does, or suppress region for nodes whose absolute position did not change.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Region no longer reports movement for nodes nobody touched. The frame is anchored to the nodes both sides share, mirroring what the cluster signal already did, and a region change is suppressed when the node's own centre did not move. Both halves are needed: anchoring alone still lets a shared node dragged to a new extreme restretch the frame. cannotExpress was rewritten, including the new blind spot the suppression buys.
<!-- SECTION:FINAL_SUMMARY:END -->

# Corpus compactness and typed trunks

TASK-548.08 continues after the third council verdict on `111d531c6`.
The four previous acceptance pairs improve unanimously.
Eight other pairs read worse, and Voice coordinator in Blocks contains a new mixed-kind shared run.
Both TASK-548.08 and TASK-548.11 remain In Progress until council acceptance.

The parent's quiet-box reference stays at 265/201 ms for Board viewer, 302/290 for Board persistence, and 142/134 for Archboard server routes.
Each pair gives the first render and the render after a growing edit.
Browser application takes 165/155 ms, and Live panes takes 106/103 ms.

## The missed defect

The reported routes share Tab sessions as their source.
`NfthRpE6` is an event to Coordinator tools.
`etaTfLee` is a call to Coordinator turn homes.
The old checker exempts every pair with a common source or target.
It therefore misses the different relationship kinds on one stroke.
The packed router also identifies subjects only by their original card.
It discards the kind and visual treatment when it permits shared routes.

The reduced case keeps nine cards and two relationships.
Removing any remaining context card changes the packing enough to remove the overlap.
The real Blocks renderer reproduces it with the default vocabulary.
The regression fails before the router fix and passes after it.
A separate reading test proves that the checker detects mixed kinds while allowing a same-kind common-source branch.

The fix keys packed routing identities by card and the existing `trunk_kind` value.
That value includes kind, comparison standing, emphasis, and traffic.
The checker permits a common endpoint only when the relationship kinds also match.
Common-target routes with one kind retain an unambiguous card mapping even when their emphasis differs.
Existing tests separately require distinct channels for different visual treatments.
The checker does not classify those common-target approaches as unrelated source/target trunks.

The first checkpoint passes the affected Rust tests and 657 renderer tests, with one platform-only skip.
Both native scans cover the 17 current vault boards and six fixed fixtures.
They contain no hard geometry finding with the stronger checker.
The Blocks scan records three optional lane-spacing counts under the existing Track-only rule.
The direct-header arrow test now distinguishes a crossing hop from a real bend.
It retains the complete arrowhead and rounded-bend requirements.

## Measuring every picture

`bun scripts/layout-compactness.ts <before> <after> <out>` reads every SVG in both corpus directories.
It also reads their recorded dimensions and keys.
It needs no atlas, so the same measurements apply to saved historical pictures.
The script writes complete before/after metrics, per-drawing comparisons, a report by board and engine, and every whole-board comparison.

Area is the canvas width times its height.
Aspect ratio is width divided by height.
Elongation is the larger of that ratio and its inverse.
Route length adds horizontal and vertical distances along the painted route, without crossing hops.
Detour length subtracts the distance between the route's ends.
The report keeps every route beside the longest one.
A shorter maximum can otherwise hide a newly long individual relationship.

Frame empty share measures area not covered by visible member cards.
It excludes headers, labels, routes, and clearance.
This is an occupancy measure, rather than a claim that every uncovered point is wasted.
The member envelope is the smallest rectangle around those cards.
The report also measures the frame area outside that envelope.
Nested frames are measured separately, and union area prevents overlapping cards from inflating coverage.

The initial scan covers all 2,452 drawings and all 76 whole-board pictures.
Its reference is `/tmp/548-08/round-3/base`, and its candidate is `/tmp/548-08/round-3/after-1`.
The first checkpoint's complete SVG corpus is `/tmp/548-08/round-4/after-1`.
Its reports are `after-1-vs-council-reference` and `after-1-vs-round-3` under `/tmp/548-08/round-4`.
Every report includes all 19 boards and both engines.
The original render directories remain unchanged.

## Composition hypotheses

The measurements expose Browser application's Application composition frame at 13.65 times its previous area.
Its member envelope leaves 95% of the frame outside it.
The frame has two member cards but reserves a wide row for its outgoing labels.
The next probe places labels in the lowest block that contains both relationship ends.
That placement keeps external relationship labels outside the source frame.
Parent arrows still reach their visible headers.
The probe must retain the four accepted cases and improve measurements across the corpus before adoption.

Packing scores, boundary-port stretch, and ordering of related blocks remain separate hypotheses.
Each probe keeps its pictures and geometry results.
The final candidate must pass the hard checks and retain the speed before the parent grades it.

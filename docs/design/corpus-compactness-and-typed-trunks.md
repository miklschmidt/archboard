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

`bun packages/renderer/tests/runtime/support/compare-compactness.ts <before> <after> <out>` reads every SVG in both corpus directories.
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

## The composition candidate

The measurements expose Browser application's Application composition frame at 13.65 times its previous area.
Its member envelope leaves 95% of the frame outside it.
The frame has two member cards but reserves a wide row for its outgoing labels.
Moving every label to the lowest common block does not solve this problem.
That probe enlarges several pictures and introduces a header strike.
The candidate instead changes the composition from the graph and reserves only the lanes that need concurrent space.

A parent keeps local ranks when its members depend on one another through an outside path, as in round three.
Three more graph shapes now keep local ranks when no relationship names the parent interface.
A caller context is one parent and its members.
A flat sink receives every outside call from the same caller context and has no outgoing dependency.
Its members contain no nested parents.
It contains an internal relationship, so a lone card needs no separate local ranking.
An isolated scope or a loose caller does not establish that shared context.
A nested wrapper uses local ranks only when its one descendant sends work outside it.
A parent with one exclusive outside leaf collaborator also keeps local ranks.
That collaborator has one incoming relationship and no outgoing relationship.
Its caller has exactly one relationship that leaves the parent.
Parents with named interfaces retain shared ranks unless the original outside-return rule applies.
This distinction keeps entry ordering and shared data channels intact.

An exclusive outside collaborator can share one measured row with its calling parent in Track.
The match must be one-to-one at both ends.
The caller must have no other forward relationship in that containing block.
The existing cycle analysis distinguishes a feedback relationship from forward work.
This restriction preserves fan-out and wrapped-rank ordering.
The collaborator sits beside the actual internal caller, at its port height.
Its label occupies the same measured box during ranking and reserves routing space beside the card.
The painter still draws the card at its normal width.
This composition makes the reported Tools and work and Rasterizing relationships short and horizontal.

The packer keeps its existing boundary-pin estimate, packing score, and crossing cost.
Channel width now follows the maximum concurrent runs in each facing gutter.
Separate runs at different heights reuse its width.
The count includes turns beyond the facing boxes, because those turns can still share a trunk.
Each run reserves its bend and straight approach distance beyond both ends.
Nearby elbows therefore count as concurrent even when their straight portions do not overlap.
Each relationship retains a separate lane reservation, including branches that share some existing ink.

Port settlement stays unchanged.
Locking every ranked route to its turn column breaks a straight chain, creates a region trunk, and makes a CLI line turn back.
Preferring those columns without restricting their spans leaves the durable-write return bend.
Restricting only an outgoing shared trunk moves the return to another relationship.
Reserving the elbows in the gutter removes the return without any port-settlement rewrite.
The existing entry-row constraints stay unchanged.

## Probes that were dropped

Moving all labels to the lowest common block causes a Blocks lookup failure and enlarges the CLI strip.
Moving only parent labels causes Track lane failures and a tall Voice coordinator picture.
Neither label-placement rewrite remains.

Giving labels independent root nodes grows Command interface in Blocks to 4.59 times its round-three area.
Browser application grows to 1.98 times its area.
Routing also becomes much slower, so the probe stops before a complete corpus.

Counting only clipped gutter intervals halves Browser application's area but creates a shared trunk on Board viewer.
The retained count includes the complete runs past the corners.
Making exact route overlap the first router cost creates another ambiguous trunk on Board persistence.
The router search cost stays unchanged.

Giving every active parent local ranks enlarges the previously accepted Code evidence picture by 59% and Startup parts by 29%.
It also creates two mixed trunks.
An area-only packing score introduces three header strikes and 15 ambiguous trunks on Archboard in Blocks.
The existing measured packing score remains.

A private three-node row for the caller, label, and collaborator gives the label too little room after rank alignment.
The retained two-node row measures the collaborator and its label together.
Removing that label from the between-row pass without reserving it lets another route pass through its words.
The retained pass temporarily treats the card and its label as one obstacle.

A broad roster rule breaks straight parallel database channels.
An unrestricted exclusive-leaf row splits ordinary forward fan-out and wrapped siblings.
Both probes are removed rather than given board-specific exceptions.
Aligning root ports again from inner turns increases the durable-write return-bend count from one to two.
The final candidate removes that extra alignment pass and every port-settlement probe.

Counting shared branches as one gutter reservation reduces the CLI view to 72% of its previous area.
It also exposes a return bend in the durable-write fixture.
The safer rule reserves each relationship and its elbows.
The CLI Blocks view area remains almost unchanged.
The full report, rather than one attractive case, decides which other changes stay.

The first complete renderer run of this candidate finds eight failures.
They expose entry ordering, straight database channels, fan-out, wrapped ranks, a return bend, and a rasterizer fixture that becomes shorter.
The retained graph restrictions and port reach address the layout failures.
The broad closed-work probe also shortens the tall rasterizer fixture below its viewport boundary.
An expanded 48-stage fixture preserves that boundary during diagnosis.
The final graph rule keeps isolated frames inline, so the original 24-stage fixture and every assertion stay unchanged.
Every probe directory remains under `/tmp/548-08/round-4`.

The first complete compactness report also exposes flowcharts at 1.80 times their former area.
The queue-edit picture gains a large empty right side and a diagonal staircase.
The One browser, two uses comparison grows to twice its former area.
Rasterized inspection rejects both changes.
Isolated scopes need no local ranks because no outside relationship stretches them.
A call to a nested parent interface also needs its existing shared ranks.
The sink rule therefore requires a flat parent that receives calls from one shared caller context.
Code facts receives calls from both Code evidence and HTTP serving.
Isolating it grows its picture by 31%, so that parent keeps shared ranks.
Server access receives calls from Commands and its members, so that subsystem can use local ranks below them.
The rule follows the graph without a grammar switch or a size cutoff.

Scoring from original card centers grows One browser, two uses to twice its former area.
Its longest route also grows by 21%.
An area-based packing score still leaves that picture at 1.75 times its former area.
Both experiments are dropped.
Charging one lane of travel per ordinary crossing grows Code evidence by 24% and Voice by 49%.
The original crossing cost stays.

Extending the hidden-part constraints to every local frame grows Key and export by 48%.
Its longest route grows from 792 to 3467 units.
Adding global entry precedence does not repair that picture.
The final candidate removes both constraint experiments.
The narrower sink rule also removes the earlier need for those extra constraints in the entry-row tests.

The compactness command lives beside the existing native-capture tool in the renderer test owner.
It reads saved SVGs through that owner's drawing readers.
It adds no runtime package export or dependency on test code from production scripts.

## Second checkpoint

The matching core is `a444102b6641c731`.
The complete corpus is `/tmp/548-08/round-4/after-6`.
It contains 2,452 SVGs, including all 76 whole-board pictures.
Compared with round three, 232 drawings change across 18 boards.
Changed boards include Archboard, Archboard server, Archboard server routes, Board persistence, Board rasterizer, and Board viewer.
Browser application, Codex realtime voice, Codex workhorse, Command dispatch, Command interface, and Live panes also change.
Renderer layout, Semantic renderer, Skill evaluation, Voice coordinator, Inventory service, and Web shop complete the list.
`milestone-2-after-6` contains both SVG sides, every whole-board pair, and the 13 selected council cases.
All earlier directories remain intact.

The complete reports are `after-6-vs-round-3`, `after-6-vs-checkpoint`, and `after-6-vs-council-reference` under `/tmp/548-08/round-4`.
Each contains per-drawing values, every route and frame, all whole boards, and a report for all 38 board/engine combinations.
The largest remaining area increase is Tools and work at 9.6%.
Its longest route falls from 2382 to 1074 units.
Every other drawing grows by at most 2.3%.
The two singleton regressions, Hosts and entries and Workhorse starter port, now match round three exactly.
Idle wrappers stay inline, and sink scopes require internal work.

This checkpoint preserves the four previously accepted cases.
It improves the reported Track collaborator routes and the large whole-board compositions.
Code evidence in Blocks and What the CLI can be asked in Blocks remain almost unchanged.
Those two acceptance cases need another layout change before the round is ready for council review.

The renderer suite passes 660 tests, with one platform-only skip.
The layout crate tests and strict clippy pass.
The native scans cover the 17 current vault boards and six fixtures in each engine, plus the 13 selected council requests.
They contain no hard geometry finding.
Three Blocks pictures retain optional lane-spacing observations under the existing Track-only rule.
Header, endpoint, card, label, visible-frame, and mixed-trunk checks stay hard.

The full gate passes lint, formatting, type checks, Rust documentation, and Rust tests.
Its module lane passes 4949 tests and fails one real rust-analyzer request at its deadline.
That untouched test passes a focused rerun in 1945 ms without a code change.
The complete gate remains pending.

Fresh native instruction counts use the same three saved requests and P-core 2.
The original baseline uses 152.717 billion instructions.
Round three uses 9.198 billion, and this checkpoint uses 9.205 billion.
The reduction from the original is 94.0%.
The native critical paths, best of three, are 80, 84, and 72 ms for Viewer, Persistence, and Routes.
The original paths are 1052, 1099, and 326 ms.
The solve counts remain one per board, against 24, 25, and 27 originally.

Three alternating growth runs give median first/growth times of 283/206, 302/290, and 145/134 ms.
The original medians are 1591/1473, 1497/1476, and 599/586 ms.
The owner's round-three reference remains 265/201, 302/290, and 142/134 ms.
Both timing methods keep every individual run and its load in `after-6-measurements`.
Its `summary.json` also keeps both seven-render pool runs for every measured board.
The native instruction run starts at load 0.64.
The alternating pool runs start at loads 1.55 to 2.38, and the growth runs start at 3.52 to 4.04.
These runs follow the orphan-process repair and do not use the earlier load-40 wall times.

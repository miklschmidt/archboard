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

## Third checkpoint: compose independent work and share coherent entries

A named parent interface can contain independent member work beside nested frames or regions.
Blocks now packs each disconnected member set as one unit.
A direct member relationship keeps its two cards in the same unit, regardless of direction.
The board and unnamed scopes keep their shared collaborator context.
This rule removes empty bands from the Commands frame without a board name or card-count threshold.

Entry work means destinations reached together by one caller.
Blocks can share an incoming port for that source's coherent entry work.
The branch labels must follow that boundary.
Every relationship from that source into this parent must share its treatment, direction, and label ownership.
Entry destinations can call each other.
A destination called by other member work keeps its own port.
Direct header entries, fixed side ports, inline Track entries, and target joins retain their existing identities.
The core makes these choices from containment and relationships before it creates ports.
It asks for no speculative solve.

The first shared-entry probe exposes a real packed-header clearance error.
A settled top port stands 16 points beside its header, but the trunk router requires 20 points.
The overlapping clearance triggers the free-port fallback and crosses the header.
Packed port placement and settlement now use the router's actual clearance.
A reduced 19-card Archboard server fixture reproduces both old header crossings.
The renderer regression keeps header crossings as hard failures.

Broadly splitting loose cards grows Board persistence by 60% and Voice coordinator by 25%.
That probe is dropped.
The retained rule applies to a named parent interface, which gives independent member work an explicit boundary.
The first shared-entry rule also grows the Rasterizing Blocks view by 38% and the Workhorse operations responsibilities view by 27%.
Visual inspection finds a new empty left pocket in each picture.
Keeping later destinations on their own ports reduces those increases to 0.5% and 3.4%.

The first full-corpus pass finds another regression outside the named acceptance cases.
Working with an agent in Blocks grows by 13.6%, and its longest route grows by 10%.
The mixed-traffic entry probe is dropped after visual inspection.
The complete-entry rule reduces that picture's area by 4.0% and its longest route by 2.0% in the native probe.

A weighted-perimeter packing probe reduces several large pictures but creates ambiguous trunks and detached labels.
It is dropped.
The existing packing score and crossing cost remain unchanged.
The report now includes total relationship length as well as the longest route.
This separates a single route tradeoff from an increase across all of the picture's relationships.
The owner's shared composition criteria guide inspection, and defects remain an independent gate.

## Fourth checkpoint: private wrapper collections and complete frame units

The total route measure exposes a regression in Workbench reuse that page area alone misses.
The third checkpoint makes that view 22.6% smaller, but its total relationship length grows by 53.5%.
Its longest route grows from 1335 to 3287 points.
The outside caller's label falls below the entire inline hierarchy before returning to its target.
The return is visibly worse and is removed.

A closed collection of transparent parent frames now uses local ranks for one exclusive outside root caller.
Each nested parent contains one leaf card, and every leaf belongs to a nested parent.
The caller sends one relationship and receives none.
The collection contains internal work and has no outgoing dependency.
This describes a wrapper, rather than a card-count threshold.
Complex scopes keep their existing entry ordering.

The broader private-scope probe fails the service's established entry-row test.
A new nested service regression reproduces the same failure: Scheduler stands beside API instead of below it.
The transparent-wrapper restriction keeps both entry-row contracts intact.
No holding rule or assertion is weakened.

A trace finds another source of long returns.
Track folds an all-unit parent into columns, so the later facing pass cannot find its original child boxes.
Both engines now pack complete parent frames when their holder has no inline clusters or labelled trunks.
Track's organizational regions keep their shared rank context.
The inline-cluster guard preserves every parent frame.
Labelled exits use the existing facing walls, wall stubs, and label ranks.
The obsolete bottom-face restriction and its argument are removed.

The broader all-unit probe is dropped.
It creates two ambiguous trunks in Board persistence and one label across a wall in Skill evaluation.
The retained Track case accepts complete parent frames only.
Blocks keeps its existing region packing.
The final current-vault captures cover all 17 boards in both engines and contain no hard finding.
Board viewer in Blocks retains four optional lane-spacing observations under the existing Track-only rule.

The final core is `65e48764d0efbd32`.
Its corpus is `/tmp/548-08/round-4/after-15`.
It retains 2452 SVGs, including 76 whole-board drawings across both engines and themes.
Compared with round three, 272 drawings change across 18 boards.
The paired SVGs are in `milestone-4-after-15`, with 13 selected acceptance cases and a manifest for every whole board.
Reports against round three, the third checkpoint, and the older council reference retain every drawing, frame, and route measure.
The full report is `after-15-vs-round-3/per-board.md`.

Workbench reuse now uses 37.3% less page area than round three, and its longest route falls to 875 points.
Code evidence in Blocks uses 16.6% less area, with its two frames beside each other.
The Blocks command-family view uses 29.4% less area and 14.8% less total relationship length.
The largest remaining area increase is Tools and work in Track, at 9.6%.
Its total relationship length falls 11.6%, and its longest route falls 54.9%.
Reserving 4 in the Inventory fixture grows 7.7%, with 5.5% more total relationship length and an 8.5% shorter longest route.
Visual inspection retains this small tradeoff: both branch labels stay distinct, and the paths need fewer crossings.
Workspace packages in Blocks grows 6.2%, with 13.8% less total relationship length and a 34.2% shorter longest route.
All other page-area increases stay below 4.6%.
The per-board report names these costs alongside the gains.

The renderer suite passes 668 tests, with one platform-only skip.
The layout crate tests and strict clippy pass.
The first repository gate finds two missing schema defaults in the fork test's added relationships.
Both relationships now state normal emphasis, which matches the renderer's existing default.
The gate is rerun after that type correction.
The proposals match the final source, remain drafts, and retain the same 41 code-finding identities with no new finding.
The consumer skill needs no change because the agent workflow does not change.

Fresh counters pin each native run to P-core 2.
The original baseline uses 152.724 billion instructions, round three uses 9.188 billion, and the final core uses 9.211 billion.
The reduction from the original baseline is 94.0%.
Viewer, Persistence, and Routes each use one solve, against 24, 25, and 27 originally.
Their native critical paths, best of three, are 81, 84, and 73 ms.
The original paths are 1054, 1093, and 326 ms.

Three alternating growth runs give median first/growth times of 277/203, 301/287, and 141/134 ms.
The original medians are 1546/1437, 1458/1452, and 581/573 ms.
The owner's quiet round-three reference remains 265/201, 302/290, and 142/134 ms.
Both alternating seven-render pool runs time every measured board.
Viewer first renders change from 1419/1441 to 201/200 ms.
Persistence changes from 1475/1481 to 298/296 ms.
Routes changes from 677/635 to 149/158 ms.
Every individual run, cached-render time, source hash, card-growth assertion, and load is retained in `after-15-measurements`.
Its `summary.json` contains the complete measurements.
Counter runs start at loads 0.67 to 1.66, pool runs at 1.60 to 2.07, and growth runs at 1.83 to 2.90.
The retained performance evidence uses none of the old load-40 wall times.

The next step is the parent's four-grader council, using the shared criteria and the retained SVG pairs.
The tasks stay In Progress until that verdict.
Broader private scopes need their entry-order contract before they can replace shared ranks.
Organizational-region packing needs a traceable treatment of mixed joins before it can replace the existing Track pass.

The final complete gate passes all 20 tasks, including the browser lane.
The prior full run fails only the untouched real rust-analyzer deadline test at 2073 ms.
Its focused rerun passes in 1900 ms, and the final full run passes without a code change to that owner.
The final current-vault integrity capture produces 34 SVGs that exactly match their light-theme corpus counterparts.
It has no hard finding.
These fresh captures supplement the older native request snapshots.

## Post-council frame bounds

The fourth council accepts all 42 sampled pairs: eight better, 34 the same, and none worse.
No after picture contains a new defect.
The subsequent source review finds a boundary case outside that sample.
A reduced ten-card Track input places a leaving label across its source parent's bottom wall.
The existing `labelsAcrossWalls` reader reports `e5 across 20,20`.

The label shares the last member's band, after horizontal settlement moves it between the frame's side walls.
Its bottom extends 24.5 points below the lowest member card.
Container sizing includes labels only when both relationship endpoints belong to that container.
It therefore omits this leaving label and closes the frame through it.
The trace rules out a later scene-painter move.

Container bounds now include labels that occupy the existing member bands and fit between the side walls.
Internal relationship labels retain their existing containment rule.
Labels on later bands stay outside, so a distant external label cannot stretch the frame.
This correction uses the existing band and inset model, without another solve or a routing exception.
The renderer regression owns the reduced input and the existing hard wall reader.
It fails before the bounds correction.

The correction leaves the architecture proposals and consumer workflow accurate.
It needs no new architecture decision or consumer-skill change.

Core `983e6d4c750e9aae` passes the regression and the original reproducer.
The source frame grows by 24.5 points, with no change to card positions or relationship routes.
Rasterized before and after pictures show the label wholly inside its frame.
All hard geometry readers pass on that reduced input.
The renderer suite passes 683 tests, with one platform-only skip.
The layout crate tests, strict clippy, and complete repository gate pass inside `nix develop`.

The new corpus is `/tmp/548-08/round-4/after-16`.
Every one of its 2452 SVGs matches `after-15` byte for byte, including all 76 whole-board drawings.
The complete compactness comparison is `after-16-vs-after-15`.
The manifests in `milestone-5-after-16` list zero changed drawings, with light/plain pictures separate.
That directory also retains the reduced regression's before and after SVG paths.

Three fresh runs give median first/growing-edit times of Viewer 281/204 ms, Persistence 299/289 ms, and Routes 142/134 ms.
Each edit increases the measured card height.
All three runs start at a one-minute load of 2.96, after the complete gate exits.
Raw runs, the source hash, and median calculations are in `boundary-fix/measurements.json`.
The process audit finds no remaining Git owner process.
TASK-548.08 stays In Progress for the parent to finalize.

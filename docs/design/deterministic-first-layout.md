# Deterministic choices for a first layout

Milestone 7 uses one Solver call for each architecture graph.
It replaces speculative nesting, stacking, join, card-graph, and routed-packing choices with decisions before their expensive work.
It repairs Groups parent frames and removes the 32-card cutoff.
Semantic lane reservations replace the later nudge phase.
Checkpoint `66dcc7dd4` repairs the full painted header cards and their direct arrow endpoints.
The earlier `de398584a` checkpoint misses those defects and is not a delivery candidate.
The parent council still decides whether the changed drawings can land.

The latest pair after orphan cleanup places all three warmed first renders and growing edits below 500 ms.
Viewer takes 384 ms for its warmed first render and 378 ms after growth.
A fresh-process viewer takes 523 ms, so the strict cold target still needs headroom.
The instruction count falls by 93.68% against the fresh parent baseline.
The detailed measurements and corpus inventory follow at the end of this note.

TASK-548.08 starts at `764d3b9ca` on `task-548.08`.
The owner targets first renders and size-changing edits below 500 ms.
The current slow boards are Board viewer, Board persistence, and Archboard server routes.
The grading council of TASK-548.09 decides whether changed drawings can land.

## Commit and corpus map

| Checkpoint                      | Commits on this branch                                      | Corpus                                         | Standing                                                  |
| ------------------------------- | ----------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| Unsupported wrap filter         | `f2b679f63`                                                 | `/tmp/548-08/after-1`                          | Later removed with the speculative solves.                |
| Unconditional packing prototype | No retained code commit                                     | `/tmp/548-08/after-2`                          | Dropped for routing defects.                              |
| Packing with a size cutoff      | `42c7f6c1a`, `a984ae2e1`, `dafbb76da`                       | `/tmp/548-08/after-3` and `after-3-full-vault` | Council rejects hidden Browser application parent frames. |
| Packed parent frames            | `adc7bc3de`                                                 | `/tmp/548-08/round-2/after-4`                  | Retained, then extended by the header repair.             |
| Stacking eligibility            | `f0674f18d`                                                 | `/tmp/548-08/post-553/after-5`                 | Retained.                                                 |
| One solve and semantic lanes    | `2cc0ae9f0`, `de398584a`                                    | `/tmp/548-08/post-553/after-6`                 | Header defects require the next checkpoint.               |
| Visible header cards            | `66dcc7dd4`, `68fd895c6`, `b5a4b498a`, `d461d37e9`          | `/tmp/548-08/post-553/after-7-delivery`        | Delivery candidate, council pending.                      |
| First local ports               | Proposal `e455b15c3`, rejection and restoration `d461d37e9` | `/tmp/548-08/post-553/after-8`                 | No rejected code retained.                                |

The early runs use the sources and tools available when those runs occur.
The post-TASK-553 parent baseline is `/tmp/548-08/post-553/base` at `f06fa5317`.
The detailed sections distinguish quiet measurements from historical runs under orphan load.

## Measurement reset after TASK-553

TASK-553 fixes a Git owner process that survives its caller and spins at full CPU.
The parent finds 37 such orphans on this machine.
They account for the sustained load near 40 during the earlier experiments.
The earlier native elapsed paths, pool timings, and corpus durations remain historical logs, not performance evidence.
Instruction counts still describe work, with the virtual-clock caveat below.
All wall-clock comparisons need fresh measurements after this fix.

The branch rebases onto `f06fa5317` before further work.
The frame-fix checkpoint becomes `adc7bc3de`, previously `e2cfd77e7`.
The core rebuild succeeds, and the process inventory finds no Git owner worker.
Fresh measurements and complete corpora stay under `/tmp/548-08/post-553`.
Their parent baseline uses `f06fa5317` and the matching core source hash `ce42bd12e4ee9ccb`.
The corpus tool still includes every whole board beside the authored views.

### Fresh parent and no-op stacking checkpoint

The parent baseline now reports load 3.32 to 4.08 during the pool pair.
The repaired candidate reports load 4.40 to 4.59.
The baseline instruction count is 152.714 billion, and the candidate count is 58.158 billion.
Their solve counts are 27/25/24 and 27/5/4 in routes/persistence/viewer order.
The best native paths are 329/1100/1059 ms before and 329/186/255 ms after.

| Board                   | Parent first, ms | Candidate first, ms | Parent growing edit, ms | Candidate growing edit, ms |
| ----------------------- | ---------------: | ------------------: | ----------------------: | -------------------------: |
| Board viewer            |             1503 |                 392 |                    1627 |                        644 |
| Board persistence       |             1572 |                 297 |                    1564 |                        297 |
| Archboard server routes |              637 |                 653 |                     640 |                        638 |

The canonical timing script warms the renderer on another board before its first measured board.
The separate edit harness starts a fresh process and draws each board before its measured edit.
It asserts that Browser client grows from 72 to 105 units.
The other two cards grow from 105 to 139 units.
Viewer edits and both routes measurements still miss 500 ms.

The candidate also extends the existing graph proof across every block in the chosen nesting.
Stacking adds constraints only where a ranked line enters one inline container from another.
That predicate reads links and containment, without positions or measured sizes.
If no block has such a line, the renderer asks one solve rather than two speculative partial solves.
The red async contract asks two solves before the change and one after it.
The three slow complete boards contain actual stacking choices, so this proof does not reduce their solve counts.
Its simpler control flow replaces the old assumption that any graph with several blocks can stack.

The layout crate passes 102 tests, and Clippy passes with warnings denied.
The renderer suite reports 662 passes, one platform skip, and no failures.
The extended corpus changes zero of 2452 drawings against the frame-fix checkpoint.
The fresh parent and candidate corpora are `/tmp/548-08/post-553/base` and `/tmp/548-08/post-553/after-5`.
Their 22 changed drawings match the frame-fix changes, with every whole-board SVG present on both sides.
The next experiment removes the numerical cutoff and tests Groups directly on every graph that contains a multi-member region.

## Council rejection and the second round

### Unconditional Groups and routing probes

The next candidate packs every multi-member region, without a card-count cutoff.
The raw corpus is `/tmp/548-08/post-553/after-6-raw`.
It changes 130 of 2452 drawings, including 26 complete-board drawings.
It still fails nine renderer tests, so it is not a milestone for adoption.

A packed region loses two pieces of context from its inline form.
Its metadata omits an inline enclosing parent.
Its group-level callers also lose the ordering that holds them above the headers of containers they enter.
The repairs retain the parent and add those dependency constraints when they close no cycle.
The context corpus is `/tmp/548-08/post-553/after-6-context`.
The three-node ordering regression goes from a 654-unit page to a 547-unit page.
Walkthrough video's raw Track page narrows from 2432 to 1644 units.
The reduced members fixture now places two independent members beside each other.
The attempted root-column adjustment does not change that layout, so it is dropped.

TASK-548.10 enters scope because these probes reach routing.
The new trunk check finds the defect in all four council cases.
Block ports use projected blocks as keys, which loses each card's identity at a boundary.
The candidate preserves the original card endpoint in each key and in the corresponding side lookup.
The native four-case replay then reports no ambiguous trunk.

The broader nested API fixture still has ten ambiguous pairs.
Its gap estimator counts distinct positions, so overlapping routes count as one line.
Counting distinct routes removes nine pairs.
The last pair uses facing ports less than one unit apart.
Port separation now reserves a full lane rather than separating only identical coordinates.
The old score comparison can still prefer the unsettled overlap.
Always keeping the settled ports removes the remaining pair and deletes that score comparison.

A block's router can also put a lane left of its declared boundary.
The candidate carries that horizontal shift through every returned shape and through later port movement.
A native Live panes trace locates the original two-unit wall gap after port settling.
Final line simplification preserves it.
The trace files stay under `/tmp/548-08/post-553/wallhug` and the adjacent debug logs.
The temporary instrumentation is removed from the source.

Raster inspection finds a caption background across three lines in the repaired Board rasterizer picture.
The caption words are already clear of the lines.
The painter expands their background back to a corner, across the routes that the layout avoided.
The painter now limits the background to the free span around those words.
The new header check passes all four council cases in `/tmp/548-08/post-553/caption-clear`.

The endpoint check also finds an Archboard arrow 20 units beyond the Workspace packages frame.
Frame fitting ignores terminal points on ordinary frames while it pulls their walls inward.
Keeping those points repairs the native replay in `/tmp/548-08/post-553/frame-end`.
Internal relationships can still meet a parent header inside its visible frame.

The full-face probe increases the complete Board viewer drawing from 12 ambiguous pairs to 15 and adds a wall overlap.
It is rejected, and ports retain their reachable spans.
The width reservation of one lane per face port remains.
The complete native artifacts stay in `wide-faces-pictures` under the measurement directory.

The deterministic join probe places each fan-in label beside its source before a trunk that identifies the original target.
It removes the whole-board competition between label positions and wall-facing drawings.
The complete Blocks drawings then ask one Solver call each.
The source-owned port alternative clears Board viewer but leaves one server-routes ambiguity.
The target-owned plan clears Board viewer and leaves two pairs around one server-routes trunk.

The last two pairs expose an axis-order defect in the router.
Its vertical runs initially meet at one turn without an overlap.
The horizontal pass moves that turn and creates 48 units of shared vertical ink, only 0.6 units apart.
An extra vertical pass repairs this case but creates two ambiguities on Board viewer.
Repeated passes cost 75.6 seconds in the unoptimized Viewer replay and are rejected.
Keeping the full packing gap during alignment changes neither drawing and is also rejected.

The smaller repair reserves separation when unrelated runs touch and their current or desired positions approach within one lane.
The router still uses one pass per axis.
The reduced two-route regression fails without this repair and passes with it.
All 17 router tests pass, including the shared-pin and crowded-channel contracts.
Both complete Blocks drawings then contain no ambiguous trunk in `touch-wanted-wide`.
Board viewer still reports crowded lanes in the broader diagnostic report, which also applies Track's lane bound to Blocks.
Those findings remain visible evidence for further routing work and council judgment.
No wall-clock gain is claimed from these unoptimized diagnostic runs.

Later probes expose another identity loss at the router boundary.
The router previously inferred a shared end from an obstacle and coordinates.
Different cards can cross a block boundary at the same coordinates.
Each connector now carries its original source and target identities.
A line that represents several original cards marks that end as multiple rather than naming its first card.
The bundle guard retains the common source and target during each union, instead of scanning every segment again.
The 18 router tests include coincident boundary ports with different original cards.

The complete Codex workhorse drawing also has no free gap wide enough for its caption between eight incoming routes.
Moving its painted background cannot repair words crossed by those routes.
The card now reserves the caption span before the router places its top ports.
The endpoint helper also reads each painted parent header, so a line on that visible header is valid.
It still rejects ends beside an absent or covered frame.

A packed block previously reserved 48 units under its children for any number of bottom ports.
Several unrelated trunks can collapse onto the same horizontal row there.
The strip-size probe reserves lanes from the number of own ports and header relationships before routing.
Budgeting every packed gap from all links instead makes drawings larger and creates more overlaps, so that probe is rejected.
Choosing a packing first by its ambiguous pairs also fails after later port movement and is rejected.

Keeping every Blocks port on its original top or bottom face clears several ambiguities but creates a worse Browser application picture.
The parent picture is 4816 by 4504 units.
The probe leaves much more empty space and substantially longer routes, as the retained rasters show.
That face rule is rejected after visual inspection.
The current source-identity and strip probes still need complete integrity results and a council verdict.

The next plan removes the stacking competition through the existing Solver port.
Links and containment determine every acyclic caller-to-entered-header constraint before ranking.
Each architecture graph then uses one Solver call, with local wraps inside it.
The draft architecture boards state this plan before implementation.

The council rejects `f55ca07dc` on 2026-10-26.
All three graders prefer its complete Command interface drawing.
All three reject its complete Browser application drawing because parent frames disappear.
The lines into those parents end beside bare titles.
The vote and blind artifacts stay in `/tmp/grading-548-08` and `/tmp/548-08/council`.

The old geometry helpers only compare line endpoints with atlas boxes.
The atlas still contains each hidden frame, so those helpers miss this defect.
The new `hiddenParentFrames` helper names missing frames and frames painted below their enclosing container.
The actual Browser application render goes red on seven parent frames.
These include the six named by the council and Workbench client.

A reduced four-node graph also fails the Rust depth contract.
Its inner parent and outer parent both have depth zero under Groups nesting.
The painter then uses authored order to break the tie and paints the outer frame over the inner frame.
The assembly pass adds a depth step for a block frame but omits inline frames around a packed group.
The fix carries those inline depth steps into each child block.
A frame paints one depth step before its own contents.
The regression exercises the layout port without a renderer or worker.

The corpus command previously drew an implicit overview through the board's default view.
That overview does not always include every part.
The command now also draws each complete architecture directly, under a synthetic `(whole board)` key.
It draws the whole board on both engines and both themes, without comparison.
The expanded parent baseline is `/tmp/548-08/round-2/base`.
It preserves all 2376 previous drawings and adds 76 complete drawings, for 2452 drawings in total.
The current vault contributes 68 complete drawings from its 17 boards.
The example vaults contribute the other eight.

### Frame-fix checkpoint

The frame-fix corpus is `/tmp/548-08/round-2/after-4`.
Its core source hash is `eafa399121717f42`.
It changes 22 of 2452 pictures against the expanded parent baseline.
Eighteen changes are whole-board Track drawings from nine boards in two themes.
The changed boards are Archboard server, Archboard server routes, Board persistence, Board rasterizer, Board viewer, Browser application, Codex realtime voice, Codex workhorse, and Command interface.
The other four changes are authored Codex realtime voice views.
Every changed picture has its SVG on both sides.
The Chromium detail now shows Semantic viewer's frame, header, and connected lines.
All 17 complete current vault diagrams report zero geometry findings, including the new frame assertion.

The layout crate passes 102 Rust tests, including the red-then-green depth regression.
Clippy passes with warnings denied, and types and focused lints pass.
The renderer suite reports 661 passes, one platform skip, and one timing failure.
Codex realtime voice takes 3093 ms against its 3000 ms bound, then 3082 ms in a focused rerun.
The separate full-source geometry run imposes no timing bound and reports zero findings.
This checkpoint leaves the layout choices unchanged from the rejected candidate.
It repairs the cause rather than excluding Browser application from Groups.

The native instruction count is 58.114 billion, against the original parent baseline's 152.711 billion.
This difference still comes from the packing shortcut, not from the frame repair.
The three native solve counts remain 27, 5, and 4 in routes, persistence, and viewer order.
The best three-round paths are 458, 260, and 793 ms at load 41.91 to 40.39.
The pool pair uses the parent sources first and restores the checkpoint through an exit trap.

| Board                   | Parent first, ms | Frame-fix first, ms | Parent growing edit, ms | Frame-fix growing edit, ms |
| ----------------------- | ---------------: | ------------------: | ----------------------: | -------------------------: |
| Board viewer            |             4359 |                1733 |                    4043 |                       2111 |
| Board persistence       |             3315 |                1180 |                    2943 |                       1094 |
| Archboard server routes |             2437 |                2607 |                    1926 |                       2730 |

The parent pool reports load 40.39 to 41.47.
The checkpoint pool reports load 41.47 to 45.53.
Their first-render totals are 22092 and 19952 ms across the same 23 workloads.
The card-growth assertions pass, and the pool still exceeds the 500 ms target.
The next work replaces the tuned packing cutoff and removes redundant stacking choices from graph facts.

## Measurement method

The baseline is the code before these experiments.
Both builds use the same current vault and fixtures.
The corpus includes every current view under both engines, both themes, and both comparison modes.
Each corpus run uses one job and preserves its SVG files.
The baseline directory is `/tmp/548-08/base`.

This shared 24-thread machine has substantial unrelated work.
The initial native runs report load averages from 50.95 to 52.94.
These measurements cannot establish the acceptance criterion for a quiet machine.
Instruction counts provide a separate measure of work.
The native critical path is the longest dependent chain of solves.
The example simulates one available worker for each solve.

The baseline native binary is `/tmp/548-08/base-critical-path`.
The first requests in `/tmp/548-08/early-requests` use the real request writer with a capture host.
The prescribed capture script supplies `/tmp/548-08/requests`.
Its render requests equal those from the capture host.
The capture host supplied extra unused icons, which do not affect layout.
The capture host records the request before the core loads.
It supplies the real policy, theme, and icon paths.

| Board                   | Solves | Best native path, ms | Path                                |
| ----------------------- | -----: | -------------------: | ----------------------------------- |
| Archboard server routes |     27 |                 1515 | Stacked partial, then wrapped whole |
| Board persistence       |     25 |                 1713 | Stacked partial, then wrapped whole |
| Board viewer            |     24 |                 2070 | Stacked partial, then wrapped whole |

A separate pinned run records 152.717 billion `cpu_core/instructions/u` across all three boards, one round each.
The process uses CPU 2, a performance core.
The hybrid processor also prints a `cpu_atom` counter with zero running time.
Only the performance-core counter above measures this pinned process.
The full output stays in `/tmp/548-08/base-instructions.txt`.
That run reports paths of 794, 1577, and 1863 ms, respectively.
The difference between runs illustrates why elapsed time needs qualification.

## Experiments

The first experiment rejects an impossible wrap from its group membership and row numbers.
A wrap lowers cards into rows.
Once a group starts, a later row needs a card of that group in the preceding row.
If that row is absent, no horizontal position can provide support.
The existing `sinks` predicate rejects the candidate after Graphviz computes positions.
The proposed rule rejects it before any solve or Graphviz call.
A group that starts below other groups can still use their preceding row.

The second experiment chooses Groups nesting before solving whenever the graph contains a group region.
Each region becomes a separate block, so Graphviz works on smaller graphs.
The existing competing inline nesting disappears.
This experiment needs drawing evidence because it changes how group regions fit together.

A separate possible lever asks Graphviz for straight routes instead of polylines.
Archboard routes the final lines itself, but it uses Graphviz routes as initial positions and movement constraints.
This lever also needs drawing evidence.

## Architecture

The initial row-support experiment leaves the renderer boards accurate.
It changes which impossible candidates the existing wrap search omits.
The Solver port, worker pool, choices between feasible layouts, and Graphviz interface stay the same.
It replaces no clause of ADR 0059 or ADR 0060.
The packing experiment changes the choice contract and needs the proposals described below.

## Baseline through the worker pool

The one-job corpus draws 2376 pictures from 2432 jobs in 51 seconds.
The baseline uses `timing.ts 7` at load 42.53 to 43.26.
The separate edits run grows the first leaf card by two lines.

| Board                   | Pool first, ms | Edit run first, ms | Size-changing edit, ms |
| ----------------------- | -------------: | -----------------: | ---------------------: |
| Board viewer            |           4553 |               5244 |                   4586 |
| Board persistence       |           2918 |               4312 |                   3722 |
| Archboard server routes |           2658 |               2443 |                   2227 |

The baseline renderer suite reports 659 passes, one skip, and three failures.
All failures are the existing 3000 ms bound in `wide-boards.test.ts`.
Board persistence takes 3932 ms, Board viewer 4864 ms, and Codex realtime voice 3124 ms in that run.
The geometry assertions pass.
The log stays in `/tmp/548-08/base-renderer-tests.log`.

Chromium rasterizes the baseline samples and proves cleanup of its process and temporary directory.
The full drawings and details stay beside the corpus SVGs.
The viewer sample separates the picture supply pipeline from stage reads and preserves each route and label.
The complete viewer drawing contains large empty spans and long lines between its containers.

## Milestone 1: omit unsupported wraps

The row-support rule lived in `track/score.rs` and filters `blocks/wraps.rs` before column choices are expanded.
The existing geometric sink test still decides whether a supported row actually overlaps the card above it.
The rule preserved the fallback that lets a group start below another group.
Two focused Rust cases hold rejection and that fallback.

The corpus at `/tmp/548-08/after-1` changes zero of 2376 drawings.
The layout crate passes 102 tests, and Clippy passes with warnings denied.
The renderer suite reports 660 passes, one skip, and two timing failures.
Board persistence takes 3665 ms and Board viewer 4297 ms against the 3000 ms limit.
All six drawing-integrity cases pass.

The pinned one-round instruction count falls from 152.711 to 150.461 billion, a 1.47% reduction.
The corresponding critical paths total 4322 ms before and 3617 ms after.
Their board paths are 723/1815/1784 ms before and 630/1520/1467 ms after, in routes/persistence/viewer order.
The solve counts fall from 27/25/24 to 26/23/23 in those runs.
Elapsed times do not isolate the effect at this load.

The critical-path tool uses measured solve durations to order virtual replies.
That ordering can change which speculative solves it computes.
One later round asks only 16 persistence solves, so instruction counts from this tool also need their solve counts beside them.
The rule removed impossible work, but these measurements do not establish a consistent pool gain.
An interrupted three-round run supplies complete routes and persistence rows, but no complete viewer row.
A separate three-round viewer run reports 2358 ms.
Those files remain available rather than being presented as one completed run.

Pool runs alternate the baseline sources and their saved core with this milestone.
Every source swap restores the milestone through an exit trap.
`bun run build:core` accepts the matching saved core at each swap.
No branch switch or stash is used.

| Run       | First total, ms | Viewer, ms | Persistence, ms | Routes, ms |
| --------- | --------------: | ---------: | --------------: | ---------: |
| base      |           26318 |       4553 |            2918 |       2658 |
| after-1   |           29515 |       4168 |            5665 |       2106 |
| base-2    |           26211 |       4983 |            4218 |       1962 |
| after-1-2 |           29462 |       4756 |            5432 |       2188 |

The first after run records load 49.94 to 51.87.
The paired load files preserve the remaining runs.
The size-changing edits take 2957, 3842, and 2289 ms in viewer/persistence/routes order.
The baseline edits take 4586, 3722, and 2227 ms, respectively.
These edits also need repetition on a quiet machine.

The row-support prefilter is not retained in the final candidate.
Its first experiment saves 1.47% of native instructions without a consistent pool gain.
The retained path keeps the geometric sink test and reuses ranked geometry for that decision.

## Dropped: unconditional group packing

The unconditional experiment is `/tmp/548-08/after-2`.
It changes 100 of 2376 corpus drawings, all in Track.
The six fixed drawing-integrity cases pass, but the full renderer suite fails nine cases.
Live panes gains a route that hugs a container wall.
Small fixtures lose column alignment, clean bends, or the reading that their existing tests require.
A raster inspection of Walkthrough video also shows a much wider empty group region.
The unconditional rule is therefore rejected before council grading.

The speed lever is substantial despite that rejection.
The pinned instruction count falls from 152.711 to 36.948 billion, a 75.8% reduction.
The three-round native paths are 281 ms for routes, 262 ms for persistence, and 523 ms for viewer.
The solve counts are 7, 5, and 4, respectively.
The original paths need 27, 25, and 24 solves.
The worker pool reports 1952, 995, and 1534 ms for those first renders.
Size-changing edits take 1506, 977, and 2101 ms.

The next probe keeps graphs below 32 leaf cards inline.
This is a static performance crossover, not a promise that every packed graph reads better.
The small fixtures and Live panes are the rejection signal.
The large viewer and persistence graphs retain the same candidate path that saved most work.
The existing reduced fixtures provide the diagnostic loop, so no new routing fixture is needed.

TASK-548.10 remains separate.
This work changes nesting selection and does not rebuild bundling or routing.
The parent supplied the council procedure from `cb137ed03`.
Merge commit `bd02b970e` includes those tools for the handoff.

## Refined choice: bound the compact comparison

Forcing all small grouped graphs inline fixes the unconditional rule's original failures.
It also fails three reduced fixtures that need packing, so that rule is dropped too.
The command and red output stay in `/tmp/548-08/small-inline-probe-tests.log`.
The probe runs 60 cases in 5.15 seconds, with 57 passes and three failures.

The retained candidate preserves the existing comparison below 32 leaf cards.
At or above 32 cards, it chooses group packing before solving.
This is one core with a size-based choice, and it exposes no old/new implementation switch.
The comparison remains where the existing fixtures demonstrate that both nestings are necessary.
The viewer has 54 leaf cards and persistence has 37.
Server routes has 28 and Live panes has 27, so they retain the compact comparison.
The first two slow boards therefore retain the large speed lever without the small-graph regressions.

The leaf count comes from the same block tree that discovers regions.
The refinement adds no extra graph parse and no user-authored layout setting.
A large synthetic graph asserts that every requested solve uses Groups nesting and that a host failure returns immediately.
The existing compact-graph test continues to exercise failures from either nesting.

The crossover of 32 cards is conservative and empirical.
It leaves the remaining joins, stacking, and wrap choices intact.
It does not yet make every first render one solve or establish the 500 ms target on a quiet machine.
A future change can replace more choices after the parent judges this milestone.

## First candidate results, rejected by the council

The final corpus is `/tmp/548-08/after-3`, rendered with the parent council tools merged at `bd02b970e`.
It changes zero of 2376 drawings against `/tmp/548-08/base`.
Blocks and Track each contribute 1188 drawings.
The complete source diagrams of viewer, persistence, and routes also match the baseline SVGs byte for byte.
Their full drawings and cropped Chromium captures remain in both directories.
The final viewer detail shows the same picture-supply region, card positions, labels, and routes.
The inspected target samples show no new defect.
A separate capture of all 17 complete current vault diagrams finds two changed Track drawings.
These complete diagrams include every part rather than one authored view.
Browser application changes from 13575 by 4325 to 9440 by 5739.
Command interface changes from 15894 by 3664 to 9919 by 4640.
Both use less width and more height.
Chromium captures preserve the complete drawings and three detail regions for each version.
Browser application contains routes across container header cards in both versions.
This milestone leaves that existing routing defect in place.
The geometry helpers find no missing parts or lines, routes through leaf cards, misplaced labels, wall hugs, slants, or near lanes.
Those helpers exclude container headers.
Both versions pass the same geometry assertions, and their repeated SVG hashes match the timing captures.
The initial inspection misses the hidden frames.
The council rejects this first candidate, as recorded above.
The manifests and SVGs stay in `/tmp/548-08/base-full-vault` and `/tmp/548-08/after-3-full-vault`.

The native binary is `/tmp/548-08/after-3-critical-path`.
The pinned counter run records 58.131 billion instructions, 61.9% below the baseline's 152.711 billion.
The virtual-clock caveat above still applies, so each result includes its solve count.
The full three-round run completes and records the following best paths.

| Board                   | Baseline solves | Retained solves | Retained native path, ms | Graphviz on path, ms |
| ----------------------- | --------------: | --------------: | -----------------------: | -------------------: |
| Archboard server routes |              27 |              27 |                      506 |                  173 |
| Board persistence       |              25 |               5 |                      262 |                  108 |
| Board viewer            |              24 |               4 |                      351 |                  146 |

Routes retains its compact comparison, so its elapsed difference is not a claimed algorithmic gain.
The final counter run reports paths of 1128, 267, and 373 ms in routes/persistence/viewer order.
The subsequent best-of-three run reports 506, 262, and 351 ms.
These differences illustrate the remaining elapsed-time noise.
The tool reports a total of 1118 ms before it rounds each board result.
The retained native run reports load 49.06 to 48.01.
The original unpinned best-of-three run totals 5298 ms, at load 50.95 to 52.94.
The pinning and load differ, so those totals are observations rather than a controlled speed ratio.

The first retained pool run reports load 42.13 to 41.67.

| Board                   | Baseline first, ms | Retained first, ms | Baseline growing edit, ms | Retained growing edit, ms |
| ----------------------- | -----------------: | -----------------: | ------------------------: | ------------------------: |
| Board viewer            |               4553 |               1370 |                      4586 |                      1329 |
| Board persistence       |               2918 |                714 |                      3722 |                       927 |
| Archboard server routes |               2658 |               1739 |                      2227 |                      2041 |

The final alternating pair repeats the same 23 workloads with seven renders each.
The first total falls from 25656 to 18837 ms.
The baseline reports load 41.51 to 42.19, and the retained run reports 41.71 to 46.62.
The capture wrapper saves complete SVGs after the timers finish.

| Board                   | Paired baseline first, ms | Retained first, ms | Baseline growing edit, ms | Retained growing edit, ms |
| ----------------------- | ------------------------: | -----------------: | ------------------------: | ------------------------: |
| Board viewer            |                      3525 |               1785 |                      4669 |                      1430 |
| Board persistence       |                      4189 |                564 |                      5065 |                      1365 |
| Archboard server routes |                      2590 |               3085 |                      1710 |                      2363 |

The edit harness asserts that each card actually grows.
Browser client grows from 72 to 105 units.
The server and Board routes cards each grow from 105 to 139 units.
The unchanged routes algorithm gets slower at the higher final load, which limits elapsed-time comparisons.
The matching native instructions and large solve-count reductions provide stronger evidence for viewer and persistence.
The pool remains above 500 ms, so this milestone does not complete the owner's target.

The final renderer suite passes 662 tests, skips one platform-only case, and fails none.
The six fixed drawing-integrity cases pass separately.
The changed Rust crates pass 106 tests, and Clippy passes with warnings denied.
The complete `bun run check` gate passes, including types, lint, formatting, Rust tests, frontend builds, and all 19 browser files.
Its module lane passes 4949 tests and skips one.
The full log stays in `/tmp/548-08/after-3-gate.log`.

## Rejected drawing inventory

The unconditional experiment changes 100 Track drawings across the following boards.
Each count includes themes and comparison modes.
The complete keys stay in `/tmp/548-08/after-2-changed.json`.
The unblinded inspection captures stay in `/tmp/548-08/after-2-inspection`.
These drawings are not the retained result.

| Board                   | Changed drawings |
| ----------------------- | ---------------: |
| Archboard               |                4 |
| Archboard server        |                4 |
| Archboard server routes |                4 |
| Board persistence       |               12 |
| Board rasterizer        |               20 |
| Board viewer            |                8 |
| Browser application     |                8 |
| Codex realtime voice    |               16 |
| Command interface       |                8 |
| Live panes              |                8 |
| Skill evaluation        |                4 |
| Voice coordinator       |                4 |

The reproducible new defect is Live panes edge `0L2qr5ja`, reported as a wall hug at x=2987.14.
The compact Walkthrough video picture also gains a large empty area under unconditional packing.
The existing reduced fixtures catch short sideways steps, lost column alignment, and worse fan placement.
The retained rule restores their prior comparison rather than weakening those assertions.

## Board evidence and handoff

`Renderer layout@TASK-548.08` and `Semantic renderer@TASK-548.08` describe the bounded choice.
Their comparisons change two part descriptions and one part description, respectively.
No container interface, relationship, flow, step, or walkthrough changes.
The proposals pin ADR 0061 and the task document to committed inputs.
An inherited Renderer layout reference to the pre-rebase ADR 0057 was corrected to ADR 0059.
The proposals remain drafts while this task is In Progress.
Both claims are released, and the temporary local server is stopped.

The code check reads the proposals through this checkout's server and reports no new finding on the changed parts.
Its existing Crossing pass caller warning and Scene relationship warning remain on unmodified parts.
Its information about unused native helpers and viewer exports also predates this work.
The source inspection confirms the new leaf count, early packed return, and unchanged compact comparison.
The full output is `/tmp/548-08/proposals-final-code-check.json`.

The next measurement is the same cold and size-changing workload on a quiet machine.
The next layout lever is the remaining stacking and joins choices of large grouped graphs.
In particular, the viewer still asks four solves under packed nesting.
A graph proof that stacking cannot change any packed block can remove redundant choices if that proof holds.
Their critical solves remain visible in the native path logs.
TASK-548.10 remains the separate owner of trunk ambiguity and header or arrow defects.
A straight-route Graphviz experiment is deferred because those routes seed Archboard's own routing and alignment.
No Graphviz phase or port was replaced in this task.

## One graph inside each card block

The one-Solver probe still draws Viewer three times inside its root block.
Its base graph, leaving-label remedy, and entering-label remedy each route the complete block.
A debug trace counts seven Graphviz calls, including four small group blocks.
The root calls account for 903 of 932 ms in Graphviz during that diagnostic run.
That debug wall time is not a performance result.
The pool still measures Viewer at 641 ms and its growing-card render at 680 ms with load near 12.

The next probe fixes the card graph rules before ranking.
It pulls tied titles toward their members and keeps leaving labels toward the relationship's lower end.
It anchors entering labels below internal callers when the graph permits that constraint.
These rules already exist as the three competing graph remedies.
The probe applies them together and removes their competing routed drawings.
Local wraps remain separate candidates until their cost and geometry are measured.

## Reserved routing lanes probe

The cross-axis order constraint repairs the reduced Archboard server case.
Dense Blocks drawings still force some unrelated runs onto the same stroke.
Their available channels and fixed pins contradict the spacing constraints.
The next probe reserves lanes while the path search runs.
A previous route blocks parallel travel within a lane when both original card ends differ.
A perpendicular crossing stays available.
The path search uses lane offsets beside obstacle boundaries and pins.
It produces the final route without a later pass that moves its bends.
This probe replaces the nudge phase of ADR 0059 if its drawings and cost pass the same gates.

## One retained graph and one routed packing

The next candidate removes the whole-board stacking and join competitions.
It chooses group nesting from membership and keeps acyclic container-entry constraints.
Each architecture request asks the Solver port once.
The Solver still owns local wraps, folds, and port-order candidates.
This count does not mean that Graphviz ranks only one graph inside the solve.

The card graph keeps its original title ties and always applies the leaving-label pull.
Applying every former remedy together creates new wall and lane defects, so that probe is dropped.
The entering-label anchor and untied-title alternatives are removed.
A wrap reuses its ranked geometry for its sink decision and final routing.
The packer estimates fit, route length, and crossings before it routes the selected packing.
It no longer routes every packing to score the complete pictures.

The old segment nudge phase moves a shared turn when it separates another axis.
That can join unrelated routes after an earlier axis separates them.
The replacement reserves parallel lanes during path search and keeps its resulting bends.
A hard reservation leaves some routes without a path and sends the old fallback through cards.
That probe is dropped.
The retained search minimizes reused parallel length before its ordinary path cost.
It adds grid lanes beside previous routes and reserves every fixed pin exit before the first path.
Original card identities cross each block boundary.
A source with a label before its branch also distinguishes the target.

Dense root traffic needs room before routing starts.
A first-row face now reserves space from its distinct source and target counts.
Side faces reserve enough width for their ports.
The packer counts distinct routes when it widens a crowded channel.
A child includes all its routed body in the bounds that its parent treats as an obstacle.
The clearance includes both a complete bend and the arrow approach.

The stricter title owner exposes another gap.
The inline drawing omits its fitted title bounds from the joined-line simplifier.
A safe lane then moves through the painted words during simplification.
The routed block now carries those bounds with its frames.
Blocks also routes around a projected header box while the painter uses a wider wrapped header.
Routing now uses the painted header size and origin.
The geometry owner names parent-word strikes as well as missing frames and detached line ends.

A probe that holds every settled child port creates new steps inside the child.
It is dropped, together with its broader labelled-port reach.
A fixed pair of nearby endpoints instead needs two complete turns on separate tracks.
The channel reserves those tracks before spacing the bands.
An unresolved pair that reads as one line receives a wider gap between its tracks.

Tests for the deleted global score competitions no longer select page width, aspect, or a winning bend count.
The singleton-region tests retain their card, caption, containment, and visible-endpoint owners.
The comparison test retains stable card and region geometry without demanding that a mark move a route.
The source and target integrity owners remain strict across the whole-board fixtures and council failures.
The council remains the authority on changed reading quality.

## Milestone 6 measurement before the next exact optimization

The matching core is `0a149c43490890b1`.
The renderer suite passes 648 tests, skips one platform case, and fails none.
The changed Rust crates pass 149 tests.
Clippy and Rust documentation pass with warnings denied.
The prior matching core `428cee50bb7380ad` differs only in source descriptions.

The alternating parent run uses the complete `f06fa5317` crate sources and its matching core `ce42bd12e4ee9ccb`.
The script restores the candidate sources and core before the candidate run starts.
The saved script is `/tmp/548-08/post-553/alternate-baseline-6.sh`.
The parent load ranges from 18.81 to 20.61.
The candidate load ranges from 20.37 to 20.59.

| Board                   | Parent first, ms | Candidate first, ms | Parent growing edit, ms | Candidate growing edit, ms |
| ----------------------- | ---------------: | ------------------: | ----------------------: | -------------------------: |
| Archboard server routes |              956 |                 243 |                     818 |                        216 |
| Board persistence       |             2199 |                 481 |                    2247 |                        463 |
| Board viewer            |             2132 |                 498 |                    2072 |                        499 |

The first column pair comes from the required `timing.ts 7` workload.
The growing-edit process starts with a cold viewer render of 716 ms, then grows its card in 499 ms.
Its later first renders take 477 ms for persistence and 226 ms for routes.
All three edited cards grow by the asserted amounts.
The candidate meets 500 ms in the warmed workload but lacks headroom and still misses the cold viewer case.
The next exact optimization targets repeated construction of the simplifier's unchanged geometry.

## Milestone 6 native work and drawing inventory

The saved native binaries use the same captured requests and CPU 2.
The fresh parent executes 152,722,597,050 user instructions.
Milestone 6 executes 10,402,976,071, a reduction of 93.2%.
The counter files are `/tmp/548-08/post-553/base-6-instructions.txt` and `after-6-instructions.txt`.
The native measurement pair reports load 21.81 to 19.84.

| Board                   | Parent solves | Candidate solves | Parent native path, ms | Candidate native path, ms |
| ----------------------- | ------------: | ---------------: | ---------------------: | ------------------------: |
| Archboard server routes |            27 |                1 |                    350 |                       105 |
| Board persistence       |            25 |                1 |                   1425 |                       250 |
| Board viewer            |            24 |                1 |                   1442 |                       254 |

These are the best paths over three fresh renders per board.
The total falls from 3218 ms to 610 ms before per-board rounding.
Each process also measures rendering beside the solves.
Those candidate costs are 54, 118, and 118 ms in the table's order.
The parent costs are 32, 74, and 79 ms.
The new drawing uses more paint work while it removes most layout work.

The complete candidate corpus is `/tmp/548-08/post-553/after-6` at `de398584a`.
Its parent corpus is `/tmp/548-08/post-553/base` from `f06fa5317`.
Both retain all 2452 SVGs, including 76 whole-board drawings across the vaults and examples.
The comparison changes 712 drawings: 348 Track and 364 Blocks.
It changes 72 whole-board drawings.
The complete changed keys stay in `/tmp/548-08/post-553/after-6-changed.json`.

| Board                   | Changed drawings |
| ----------------------- | ---------------: |
| Archboard               |               36 |
| Archboard server        |               44 |
| Archboard server routes |               12 |
| Board persistence       |               36 |
| Board rasterizer        |               64 |
| Board viewer            |               52 |
| Browser application     |               36 |
| Codex realtime voice    |              108 |
| Codex workhorse         |               52 |
| Command dispatch        |               28 |
| Command interface       |               60 |
| Inventory service       |               20 |
| Live panes              |               20 |
| Renderer layout         |               28 |
| Semantic renderer       |               36 |
| Skill evaluation        |               40 |
| Voice coordinator       |               28 |
| Web shop                |               12 |

I inspect the final whole Browser application and Command interface beside their parent pictures.
The new pictures retain visible nested parent frames and read down the page.
Both versions contain substantial empty frame space.
Browser application becomes narrower and taller, from 13575 × 4325 to 9210 × 7537.
That tradeoff remains a council question.
The inspected samples show no new missing frame, card strike, detached arrow, or misplaced label.
The earlier full-size Blocks samples also retain every group header and separate the unrelated trunks.

The process audits find no orphan Git owner in this checkout.
Orphans from other checkouts reappear during the work and contribute to the later load near 20.
They remain untouched because the cleanup instruction names this checkout only.
The paired wall times retain their recorded load, and the instruction counts provide the load-independent work comparison.

## Header-card defects after milestone 6

Manual inspection of Command routing finds a line through the blank face of its parent header.
The earlier helper protects only header words.
A line into that parent also stops on the surrounding frame, eight units before the visible header card.
These defects violate TASK-548.10 even when the earlier geometry report is clear.
The four council fixtures fail the stronger face and endpoint contracts before the repair.

The retained probe treats the full painted header as an obstacle.
A direct parent target meets that header's top face, including its caption offset.
Traffic to a descendant enters the container through its side below the header.
The parent keeps the child's actual header port instead of projecting it back onto the surrounding frame.
The final joined-line simplifier also receives complete header bounds.

The first Track probe moves lanes clear of each header without checking sibling cards.
It creates card strikes and is dropped.
The ordinary occupancy search already excludes cards, but its fixed 256-point search range can miss both edges of a wide header.
Known obstacle edges now remain candidates at any distance.
Physical clearance takes precedence over a lower crossing score when the current lane is illegal.

Two complete Track boards still lack space between nested frames.
Their shared ancestor keeps only the default 20-point margin.
The graph now counts the distinct semantic lanes that cross a nested header inside each shared ancestor.
That count reserves side space before Graphviz places the containers.
The same margin limits later card alignment.
Packed Blocks also reserves left-face traffic from its graph because its left boundary is fixed.

The two-container Rust contract also exposes a direction error on an entering side route.
The track router moves the upper geometric endpoint to the wall even when an upward route starts at its lower endpoint.
It now selects the wall endpoint from the route direction.
The existing contract then passes all three nestings without weaker assertions.

The stronger helper replaces the word-only helper rather than adding a second owner of the same behavior.
It rejects a route through any part of a parent header and an arrowhead that stops on its surrounding frame.
All whole-board artifacts and failed probes remain under `/tmp/548-08/post-553/header-*`.

A separate exact-work optimization retains the simplifier's static obstacles between slides.
Only the spans of moved routes change after a slide.
The previous implementation rebuilds every box, label, and route span for each line and every accepted slide.
The new implementation updates the moved route spans and retains the static geometry.
Drawing equivalence and fresh measurements decide whether this optimization stays.

The header checkpoint is `66dcc7dd4`, with core source hash `0a514cf2226b1689`.
All 149 affected Rust tests and strict Clippy pass.
All 648 renderer tests pass, with one platform skip.
The endpoint tests now measure the painted header card and retain their square approach, bend, and arrowhead requirements.

The complete corpus is `/tmp/548-08/post-553/after-7`.
It contains 2452 SVGs, including all 76 whole-board drawings.
Against the fresh parent, 744 drawings change: 364 Track and 380 Blocks.
The 18-board inventory stays the same as milestone 6.
The complete changed SVG pairs and their key manifest stay in `/tmp/548-08/post-553/changed-7-svg`.
All prior corpus directories remain available.

Fresh pinned native instructions fall from 152.729 billion to 9.654 billion, a 93.68% reduction.
The combined header repair and static-obstacle cache use 7.2% fewer instructions than checkpoint `de398584a`.
This comparison does not isolate the cache's effect.
The completed native and pool results follow below.

The final Browser application, Command interface, and Board rasterizer whole-board SVGs match the inspected native samples byte for byte.
The new reduced Command routing raster shows descendant traffic beside its header and the parent arrow on the visible card.
The broader Browser picture still contains large empty spans, as its parent picture does.
The council decides whether that changed reading is acceptable.

Renderer layout@TASK-548.08 version 107 records header endpoints and side capacity.
Semantic renderer@TASK-548.08 version 150 pins the retained decision.
Their comparisons change no container interface.
Code analysis reports the same 41 finding identities as the preceding proposal check.
Existing crossing-pass and Scene relationship warnings remain outside the changed responsibilities.
The consumer skill needs no change because the agent workflow and command contract stay the same.
The proposals remain drafts pending the parent's council verdict.

### Milestone 7 measurements and validation

The parent remains `f06fa5317`.
The final core source hash is `cba5643b6e09f19f` after a comment-only correction to the source length limit.
The route file now contains 599 lines.
The final corpus is `/tmp/548-08/post-553/after-7-final`.
It changes zero of 2452 drawings against the header checkpoint corpus.
Both directories retain all SVGs, including the 76 whole-board drawings.
The changed pair directory therefore remains valid for this final core.

| Board                   | Native path before/after, ms | Warmed first before/after, ms | Growing edit before/after, ms | Cold first before/after, ms |
| ----------------------- | ---------------------------: | ----------------------------: | ----------------------------: | --------------------------: |
| Board viewer            |                   1426 / 298 |                    2160 / 594 |                    2258 / 683 |                 2783 / 1158 |
| Board persistence       |                   1473 / 139 |                    2128 / 358 |                    2455 / 412 |                  2209 / 520 |
| Archboard server routes |                    452 / 106 |                    1148 / 295 |                     964 / 237 |                  1090 / 328 |

The native paths use the best of three rounds.
Their unrounded totals fall from 3351 to 542 ms.
Solves fall from 27/25/24 to 1/1/1 in routes/persistence/viewer order.
Render time beside those solves is 49/69/92 ms before and 55/111/117 ms after.
The pinned instruction counts are 152729195427 before and 9654477077 after.
Their baseline solve counts match the earlier instruction run.

The canonical pool script runs seven repetitions and alternates parent sources with the final candidate.
The edit harness starts a fresh process and asserts the changed card heights.
Viewer grows from 72 to 105 units.
The other two cards grow from 105 to 139 units.
The cold column records each board's first render in that separate edit harness.
Only Viewer is also the first board of the fresh process.

Parent pool load is 22.74 to 23.47, and candidate load is 23.32 to 23.78.
Native load is 22.94 to 22.64.
A later process audit finds 20 orphan Git owners under systemd in other checkouts.
They use about 1979% CPU, and none belongs to this worktree.
The user authorizes cleanup only for this worktree, so these processes remain untouched.
These wall times describe this loaded box and do not satisfy the quiet-box criterion.
The instruction counts establish the work reduction independently of scheduling.

The relevant logs use the `base-7`, `after-7`, and `native-7` prefixes under `/tmp/548-08/post-553`.
A host-phase diagnostic separately records a cold viewer at 1134 ms and its growing edit at 489 ms.
Its first solve occupies 693 ms, versus 379 ms for the edit, and painting afterward occupies 280 versus 103 ms.
This diagnostic illustrates startup and scheduling variation, not a replacement for the alternating timing pair.
The native profile records 28 thousand instruction samples with no lost samples.
Route search and repeated pair counts remain significant costs, alongside allocation and painting geometry.
Their profile stays in `after-7-perf-report.txt`.

All required renderer and changed-crate tests pass.
The full normal gate passes lint, formatting, both TypeScript projects, 4936 module tests, and 285 system tests.
Its repository lane reports 160 passes and one failure because the route file contains 604 lines.
The comment correction fixes that failure, and both focused Rust repository contracts pass afterward.
The remaining serial browser stage then passes all 19 files with the final matching core and frontend build.
A separate TypeScript run also passes after the endpoint helper becomes shared by the arrow tests.
The full gate is not reported as one successful command because its original invocation stops at the line limit.
All its stages now have passing evidence for the retained code.

The changed inventory is Archboard 36, Archboard server 44, and Archboard server routes 20.
Board persistence changes 52, Board rasterizer 64, and Board viewer 52.
Browser application changes 36, Codex realtime voice 108, and Codex workhorse 52.
Command dispatch changes 28, Command interface 60, and Inventory service 20.
Live panes changes 28, Renderer layout 28, and Semantic renderer 36.
Skill evaluation changes 40, Voice coordinator 28, and Web shop 12.
Of these 744 changed drawings, 72 are whole-board drawings.

The next speed probe must retain the repaired header and trunk contracts.
The profile supports removing repeated pair scans or deciding port order before another whole hierarchy pass.
A future worker or Graphviz port change needs separate evidence for cold startup and text serialization costs.
The parent still convenes the council, and TASK-548.08 remains In Progress.

### Measurements after the parent authorizes orphan cleanup

The parent then authorizes stopping the other checkouts' orphan Git owners.
SIGTERM stops all 23 found under systemd, and the follow-up audit finds none still running.
The first new audit reports only two runnable tasks.
A new Git owner with a live parent exits normally.
The rolling load averages still include the preceding CPU load.

| Board                   | Warmed first before/after, ms | Growing edit before/after, ms | Fresh harness first after, ms | Native path before/after, ms |
| ----------------------- | ----------------------------: | ----------------------------: | ----------------------------: | ---------------------------: |
| Board viewer            |                    1447 / 384 |                    1456 / 378 |                           523 |                   1056 / 216 |
| Board persistence       |                    1556 / 227 |                    1505 / 219 |                           229 |                   1091 / 100 |
| Archboard server routes |                     640 / 161 |                     594 / 145 |                           152 |                     327 / 73 |

The new native total falls from 2474 to 389 ms.
Its solve counts remain 27/25/24 before and 1/1/1 after.
Native load averages decay from 5.31 to 3.61 during the pair.
Parent pool load decays from 15.24 to 13.17, and candidate load decays from 6.84 to 6.53.
The process audit, rather than the delayed averages, establishes that the orphan CPU work stops before this measurement.
The logs use the `base-7-quiet`, `after-7-quiet`, and `native-7-quiet` prefixes.
All warmed target renders and growing edits now meet 500 ms.
The fresh-process viewer still takes 523 ms, so the next probe targets that remaining gap.

The quiet pinned counter repeats at 152730113322 instructions before and 9655284475 after, again a 93.68% reduction.

## Rejected milestone 8: keep each block's first port plan

The quiet viewer result still misses the strict cold target by 23 ms.
A stage trace finds 615 ms of debug viewer time in port settling.
The root reroute accounts for 604 ms of that time.
Each root input changes, so an exact-input cache cannot remove this work.
The three slow Track graphs request no face changes or held port orders.
Their remaining repeat comes from routing the hierarchy after moving its child ports.

The candidate keeps each block's first local port positions.
The enclosing block routes to those positions when it places the block.
It removes the later port movement, the retained reroute closures, and the competing port-order layout.
It also removes the width locks and frame-resize helpers that only the reroute uses.
Geometry-based wall selection remains for Blocks.
Local wrap candidates also remain.

The first diagnostic passes every geometry helper on all 23 complete Track drawings.
The Blocks inventory finds three routes through the Panes caption on Archboard server.
The caption placer protects its words but allows a line through the surrounding painted tab.
Moving the caption box does not fix this because the painter extends the tab from a group corner.
That attempted repair is dropped.

The initial port assignment already reserves caption columns for incoming ports.
The later jog closer reads a different face boundary and moves ports back into that reservation.
A line leaving the lower face can also fold back through the caption band toward a top block port.
The repair puts the caption reservation in the shared card-face calculation for both faces.
Initial assignment and every later port move use that boundary.
A seven-card, five-edge reduction fails before the repair and passes afterward with the test's own policy.
The fixture retains no code bindings, stale flows, or walkthroughs.

### Smaller probes dropped before this candidate

A sorted arrival window narrows the collinear-line counter without changing its predicate.
Its paired debug total moves from 2837 to 2811 ms, about 0.9%.
A channel score cache recomputes only channels that a move changes.
Its paired debug total moves from 2840 to 2763 ms, about 2.7%.
The cache needs additional state and does not justify that cost.

A static obstacle list moves the same debug total from 2840 to 2833 ms.
Reusing existing route spans for shared-trunk comparisons moves it from 2840 to 2814 ms.
The latter probe changes none of the three target SVGs.
All four probes are dropped, and their source and logs remain under `/tmp/548-08/post-553`.
These debug totals screen the ideas and do not establish release performance gains.
The port-plan probe instead removes repeated routing.

### Quiet performance pair for the rejected milestone 8

The pair starts with no Git owner worker present.
The parent pool run reports load 1.39 to 1.54, and the candidate reports 1.54 to 1.50.
Native measurements report load 1.50 to 2.32.
The core source hash is `8d44efdd000f0de5`.

| Board                   | Warmed first before/after, ms | Fresh harness first before/after, ms | Growing edit before/after, ms | Native path before/after, ms |
| ----------------------- | ----------------------------: | -----------------------------------: | ----------------------------: | ---------------------------: |
| Board viewer            |                    1413 / 270 |                           1657 / 406 |                    1433 / 268 |                   1058 / 137 |
| Board persistence       |                    1481 / 175 |                           1452 / 179 |                    1437 / 172 |                    1095 / 62 |
| Archboard server routes |                     642 / 141 |                            595 / 130 |                     590 / 123 |                     324 / 59 |

The native critical path falls from 2478 to 259 ms across the three boards.
Their solve counts change from 24/25/27 to 1/1/1 in the table's order.
The candidate spends another 62/66/33 ms beside its solves in that same order.
The parent spends 57/42/30 ms there.
The growing-card harness makes each measured card taller and refuses an edit that leaves its height unchanged.
The complete warmed vault inventory stays below 500 ms, with Command interface slowest at 438 ms.
The logs use the `base-8-quiet`, `after-8-quiet`, and `native-8-quiet` prefixes.

### Why the port plan is dropped

The full renderer suite reports 641 passes, one skip, and nine failures.
The first-port-plan candidate detaches an endpoint when a caption is wider than its card.
It also loses group and container wall clearance, a returning-trunk rule, and existing straight-line and crossing rules.
The shared caption boundary fixes its reduced header strike but also causes the detached narrow-card endpoint.
The 46 complete drawing inspections do not expose these smaller reachable cases.
The speed result cannot justify these failures.

The branch restores milestone 7, including its port-settling pass and port-order comparison.
It keeps the seven-card caption fixture because the restored path passes that case on both engines.
That fixture also fails on the rejected candidate before its attempted caption repair.
The complete failed corpus remains at `/tmp/548-08/post-553/after-8`.
Its rejected core, source patch, measurements, and logs remain beside it.
No rejected layout code stays in production.

### WebAssembly optimization probe

A separate probe runs Binaryen 132 with `wasm-opt -O3` on the milestone 7 module.
It reduces the module from 9866451 to 8105805 bytes, about 17.8%.
The probe keeps the existing WebAssembly features and source hash.
It changes no source or build recipe.

Viewer takes 549 ms from a fresh process and 389 ms after growth in that run.
Persistence takes 241/244 ms, and server routes takes 163/147 ms.
The warmed viewer takes 398 ms, and Command interface is slowest at 498 ms.
Load averages range from 3.32 to 3.13.
This run establishes no latency gain over the quiet milestone 7 pair.
The probe is dropped, and the original matching module is restored.
The build gains no Binaryen dependency or alternate production path.
Its inputs, output, and logs remain under the `wasm-opt-9` prefix.

The next routing probe needs an initial parent placement that lets it plan child ports before the root routes once.
Removing port settling outright fails the existing small-fixture contracts.
Any such change must retain full parent header bounds, visible endpoints, and source-to-target identity.
The parent still convenes the council, and TASK-548.08 remains In Progress.

### Delivery after dropping both probes

The delivery keeps layout code `66dcc7dd4` and core source hash `cba5643b6e09f19f`.
The complete corpus is `/tmp/548-08/post-553/after-7-delivery`.
It contains 2452 drawings from 2508 jobs, including all 76 complete architecture drawings.
Every SVG matches `/tmp/548-08/post-553/after-7-final` exactly.
The parent comparison still changes 744 drawings across 18 boards, including 72 complete architecture drawings.

Both sides of every changed drawing are SVGs under `/tmp/548-08/post-553/changed-delivery-svg`.
Its manifest maps every corpus key to the two SVG paths.
The board counts remain those in the milestone 7 inventory above.
The final renderer run passes 650 tests with one platform skip and no failures.
The two new tests cover the reduced folded-caption case without a vault dependency or a time limit.

The rejected port-plan corpus changes 752 drawings from the parent.
Its instruction log reports 7742735101 in the `cpu_core/instructions/u` field against 152711702048 for the parent.
That field covers 99.93% of the interval and excludes the startup sample from another processor type.
These figures describe a rejected layout and do not establish an acceptable performance result.
All earlier render directories and failed probes remain available.

The final architecture code check reports the same 41 finding identities as the earlier header checkpoint.
It adds none and removes none.
Renderer layout is at proposal version 110, and Semantic renderer is at proposal version 152.
Both proposals retain port settling, and the packing flow states that geometry chooses one routed arrangement.
The consumer interface does not change, so the consumer skill needs no update.

The normal gate passes lint, formatting, types, Rust, and frontend builds before its module lane stops at one unrelated Rust server test.
That test returns `unasked` while the real rust-analyzer becomes ready, and its isolated retry passes all five cases.
The initial module result is 4937 passes, one skip, and one failure.
The branch changes no timeout or assertion to hide that failure.
The remaining gate stages run separately after the focused retry.

The remaining stages pass 285 system tests, 161 repository tests, and all 19 serial browser files.
The original module failure remains recorded because the first complete command does not exit successfully.
A final audit finds no Git owner worker, and the worktree server is stopped.

The final complete `bun run check` retry exits zero with 20 of 20 tasks successful.
Its module lane passes 4938 tests with one platform skip.
It also passes all 285 system tests, 161 repository tests, and 19 serial browser files.
The real Rust server case passes in that complete retry.
The full log is `/tmp/548-08/post-553/delivery-gate-retry.log`.
This supersedes the incomplete-gate limitation for delivery without removing the earlier failure record.

The third council round uses compact parent headers and local member ranks.
[Compact parent headers and local composition](compact-parent-headers-and-local-composition.md) records its implementation, fresh measurements, complete SVG pairs, and remaining council tradeoffs.

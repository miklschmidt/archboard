# Deterministic choices for a first layout

The first candidate chooses group packing before solving graphs with at least 32 leaf cards.
The council rejects that candidate because Groups hides parent frames.
The next round fixes the layout defect before it replaces the tuned cutoff.
Compact graphs retain their existing comparison because reduced fixtures need both nestings.
The standard corpus changes zero of 2376 drawings.
A separate complete-source comparison changes Browser application and Command interface.
The three target boards remain byte-identical.
The first native counter run drops from 152.711 to 58.131 billion instructions across the three slow boards.
The 500 ms pool target and quiet-machine acceptance criterion remain unproven.

TASK-548.08 starts at `764d3b9ca` on `task-548.08`.
The owner targets first renders and size-changing edits below 500 ms.
The current slow boards are Board viewer, Board persistence, and Archboard server routes.
The grading council of TASK-548.09 decides whether changed drawings can land.

## Council rejection and the second round

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
Eighteen changes are complete Track diagrams, with two themes each.
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

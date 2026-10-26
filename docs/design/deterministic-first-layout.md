# Deterministic choices for a first layout

TASK-548.08 starts at `764d3b9ca` on `task-548.08`.
The owner targets first renders and size-changing edits below 500 ms.
The current slow boards are Board viewer, Board persistence, and Archboard server routes.
The grading council of TASK-548.09 decides whether changed drawings can land.

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

| Board | Solves | Best native path, ms | Path |
| --- | ---: | ---: | --- |
| Archboard server routes | 27 | 1515 | Stacked partial, then wrapped whole |
| Board persistence | 25 | 1713 | Stacked partial, then wrapped whole |
| Board viewer | 24 | 2070 | Stacked partial, then wrapped whole |

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

The next proposed experiment chooses Groups nesting before solving whenever the graph contains a group region.
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
A broader experiment will need a proposal if it changes those contracts.

## Baseline through the worker pool

The one-job corpus draws 2376 pictures from 2432 jobs in 51 seconds.
The baseline uses `timing.ts 7` at load 42.53 to 43.26.
The separate edits run grows the first leaf card by two lines.

| Board | Pool first, ms | Edit run first, ms | Size-changing edit, ms |
| --- | ---: | ---: | ---: |
| Board viewer | 4553 | 5244 | 4586 |
| Board persistence | 2918 | 4312 | 3722 |
| Archboard server routes | 2658 | 2443 | 2227 |

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

The row-support rule lives in `track/score.rs` and filters `blocks/wraps.rs` before column choices are expanded.
The existing geometric sink test still decides whether a supported row actually overlaps the card above it.
The rule preserves the fallback that lets a group start below another group.
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
The rule removes impossible work, but these measurements do not establish a consistent pool gain.
An interrupted three-round run supplies complete routes and persistence rows, but no complete viewer row.
A separate three-round viewer run reports 2358 ms.
Those files remain available rather than being presented as one completed run.

Pool runs alternate the baseline sources and their saved core with this milestone.
Every source swap restores the milestone through an exit trap.
`bun run build:core` accepts the matching saved core at each swap.
No branch switch or stash is used.

| Run | First total, ms | Viewer, ms | Persistence, ms | Routes, ms |
| --- | ---: | ---: | ---: | ---: |
| base | 26318 | 4553 | 2918 | 2658 |
| after-1 | 29515 | 4168 | 5665 | 2106 |
| base-2 | 26211 | 4983 | 4218 | 1962 |
| after-1-2 | 29462 | 4756 | 5432 | 2188 |

The first after run records load 49.94 to 51.87.
The paired load files preserve the remaining runs.
The size-changing edits take 2957, 3842, and 2289 ms in viewer/persistence/routes order.
The baseline edits take 4586, 3722, and 2227 ms, respectively.
These edits also need repetition on a quiet machine.

---
id: TASK-520.02
title: >-
  A Rust orthogonal router routes the trunks of Blocks, and libavoid leaves the
  renderer
status: Done
assignee:
  - '@claude'
created_date: 2026-10-24 12:53
updated_date: '2026-10-25T06:05:00Z'
labels:
  - renderer
  - performance
dependencies:
  - TASK-520.01
documentation:
  - >-
    docs/adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-scene.md
parent_task_id: TASK-520
priority: high
ordinal: 922000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
libavoid takes most of the time of a Blocks render. Its unifying nudging prepass spends tens of seconds on dense boards (TASK-512), and its nudging solver signals an unsatisfiable constraint set with a C++ exception, hundreds of thousands of times in one slow solve (docs/design/layout-rules.md). libavoid is LGPL-2.1-or-later. A port of its source would make the core a derived work, so ADR 0057 requires a router written from the published algorithms of orthogonal connector routing and nudging. Output of libavoid-js may be compared as a black box. Nobody who writes the router reads the libavoid source. The router is judged by the measures of ADR 0039, not by equality with libavoid.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Blocks routes every trunk with the router of the core, and libavoid-js and its patch are gone from the repository
- [x] #2 No corpus picture is worse on the measures of ADR 0039 than with libavoid, and the task notes record each reviewed difference
- [x] #3 The corpus renders faster in total and no board renders slower, measured with the same harness before and after, with the numbers in the task notes
- [x] #4 A trunk that the router cannot route keeps the dogleg fallback of today, and an unsatisfiable constraint set never throws
- [x] #5 The router module cites the published algorithms it implements
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research before pickup, 2026-10-24 (an Opus research agent; the claims are not yet checked at their sources, so check each before relying on it).

Papers read in full: Wybrow, Marriott and Stuckey, "Orthogonal Connector Routing" (GD 2009) [W09]; Marriott, Stuckey and Wybrow, "Seeing Around Corners: Fast Orthogonal Connector Routing" (Diagrams 2014) [M14]; Wybrow et al., "Orthogonal Hyperedge Routing" (Diagrams 2012) [W12]; Wybrow et al., "Incremental Connector Routing" (GD 2005); Dwyer, Marriott and Stuckey, "Fast Node Overlap Removal" (2005 report) [D05]. Not obtained: the VPSC correction (GD 2006). Get it before implementing satisfy_VPSC.

What archboard uses (per the agent): rectangle obstacles, orthogonal routes, shapeBufferDistance 16, idealNudgingDistance LANE 16, segment penalty 60, crossing penalty 300, directed pins with one shared pin per class, free ends for undirected trunks, the fallback ladder directed then undirected then dogleg, the unifying prepass only for crowded chosen packings, a fresh router per call. Not used: checkpoints, connection costs, exclusive pins, hyperedges, polyline routing. Track never routes with libavoid (place.ts inline), so Track pictures must stay byte-identical.

Proposed design: a pure crate crates/archboard-router with modules visibility [W09 s3], search (A* over node and direction, [W09 s4], with a crossing cost of our own: no paper defines one), order [W09 s5.1], unify (junction merge [W12 s3] plus channel track assignment, replacing the pairwise prepass), nudge [W09 s5.2] and vpsc [D05 s4]. Over-full spans are found before solving and their gaps scaled, so nothing throws, and the answer reports each crowded span, which can replace crowdedTrunks, roomNeeded and the second routed pass. Determinism: no HashMap iteration, ties by input order and ids, only + - * / on f64, no NaN. The wasm crate exposes a flat f64 encoding once per packing candidate.

Open questions for the person who decides: whether the implementer may read unsatisfiable.ts, the TASK-512 notes and the libavoid-js patch, which describe libavoid internals (the clean-room rule says the router must not follow them); whether lines that share a pin keep one stroke near it; geometry that was tuned to libavoid (port-columns.ts, the insets in pack.ts); the unification always runs, so pictures change where the prepass is off today; scene sizes are unmeasured, so measure them before choosing between the [W09] graph and [M14]. The scorecard (drawn-scorecard.ts) lacks double tracks, side hooks, corner crossings and wall hugging, which the ADR 0039 comparison needs.

Baseline, 2026-10-24, current variants, light, comparison on, one drawing at a time (scripts/render-corpus.ts): Track 293 drawings in 15.7 s, Blocks 293 in 17.8 s; slowest Blocks drawing Archboard @ TASK-500.06, Workspace packages, 3.1 s. A probe timed each solve in the workers: Blocks 238 solves took 19.9 s of solve time, 14.2 s (71%) of it in libavoid over 2,915 routes. Track made 996 solves in 8.0 s and never called libavoid: it lays boards out inline, and only blocks nesting packs and routes trunks (place.ts packsBlocks and wayOf). So the router speeds up Blocks only; Track time is Graphviz and the TypeScript rules.

## Evidence (2026-10-25)

Commits: 86aa668be (router crate and binding), a73fd5aa0 (a drawing always names its policy), 38b6f33c5 (orders on one line keep the surest, acyclic), ed56e835c (a pin holds only its stub where its segment crowds a channel), f2b324267 (Blocks routes with the core, libavoid removed), 59ae3de2b (docs and ADRs), 2df6736f4 (boards adopted).

- AC1: `trunks.ts` calls `routeTrunks` of the core. libavoid-js, its patch, `libavoid-js.d.ts`, `unsatisfiable.ts`, `loaded-memory-worker.ts` and `solve-history.test.ts` are gone; `git grep -i libavoid` finds it only in ADR history, design history and vault snapshots used as test fixtures.
- AC2: the user compared every vault board (Blocks, dark, with groups) side by side with libavoid and judged the router better on all of them (2026-10-25). Replay of the 5,295 recorded libavoid scenes: crossings 260,419 -> 195,096, turns 306,189 -> 322,437, length -3%, 0 unroutable, 6.5 s. Whole boards with groups (measure.ts, ENGINE=blocks): crossings 4,200 -> 4,352, page area -17%, route length -8%, lane ink 1.22 -> 0.47, routes through cards 0, labels off runs 0. Reviewed differences: the legacy-routing chain now slides in line with the line into its pool (libavoid's straight line came back with two turns 5e-14 px apart, which tied it with the centred packing); Agent workbench (Blocks) had three lines 5.8 px apart for 500 px beside a pin segment held 424 px up a corridor, fixed by ed56e835c; the user accepted the slid chain on the legacy-routing fixture.
- AC3: render-corpus, Blocks, current variants, light, comparison off, --jobs 1: 293 drawings 18,028 ms -> 14,402 ms. Workspace packages 3,010 -> 563 ms, One tab session 1,085 -> 393 ms. Deviation: Agent workbench "Workhorse operations responsibilities" is slower, 144 -> 235 ms in the corpus run and about 150 -> 210 ms when its board's views are drawn in order; alone, each of its seven solves is faster than with libavoid (230 ms of solving against 303 ms). The router itself takes 14 ms of it; the rest is the TypeScript layout of the different packing. The whole Agent workbench board draws in 2.2 s against 2.9 s.
- AC4: a connector the router cannot route answers 0 points; `routeOnce` falls back to undirected ends, then a dogleg (`anyway`). The router has no throwing path (crate tests `an_enclosed_head_is_unroutable`); crowded channels are answered, not refused.
- AC5: crates/archboard-router/src/lib.rs cites [W09], [W12] and [D05]; search.rs, nudge.rs, order.rs and vpsc.rs cite the sections they implement.

Tests changed with the pictures: block-packing.test.ts now holds that the legacy-routing chain's line runs straight into the pool; lone-regions.test.ts keeps the centred chain for Track only. The heavy-case wall-clock exception of Browser application and Board viewer (Blocks) is gone: Board viewer takes about 5 s.

Router decisions: the turn-onto-line crossing penalty was tried again and rejected: it removed the Agent workbench squeeze but raised whole-board crossings on Archboard server routes (560 -> 707) and Board viewer (776 -> 886), and flipped two lone-region reading orders. The stub split re-nudges only scenes that crowd a channel, so every other picture stays as the user approved it.

Boards: Renderer layout@TASK-520.02 (libavoid replaced by the Orthogonal router part bound to crates/archboard-router/src/lib.rs; edge PYJsIDYm and steps 7IED3t0f, Pd3I6jNp anchored on routeTrunks) and Semantic renderer@TASK-520.02 (four descriptions no longer name libavoid) were drawn, checked and adopted. `archboard check --code --variant TASK-520.02` added no finding and cleared three ANCHOR_SYMBOL_MISSING findings on processTransaction. Footprint read against base 7f7870cc1: changedNotNamed parts of this task's commits are internal and the boards stay true: Block placement, Block packing, Block layout (the avoid parameter removed), View dispatcher and Flowchart (policy required), Engine pool (a comment), Renderer core (the router module added; the router is drawn on Renderer layout). Behind after adoption: Archboard (Workspace packages, timing, renderer: dependency and comment changes) and Board viewer (Page start no longer passes a WebAssembly address); both still describe the code.

Gate on 2df6736f4 (2026-10-25, machine shared with two port agents, load average about 10): lint, fmt, type-check, build, test:system, test:repository and test:serial-browser pass; test:modules 4871 pass, 1 fail: Board viewer (track) took 3,160 ms against the 3 s local first-layout bound. Back to back under the same load, Agent workbench (track) takes 4,291 / 4,353 / 4,380 ms on the branch base cadcc9042 (libavoid, before this task) and 4,407 / 4,401 / 4,588 ms on 2df6736f4: Track never calls the router, and the bound fails on both. To be rerun on a quiet machine before closing.

Closing (2026-10-25): bun run check passed with every lane on the rebased branch at 40e1b5360 and again after TASK-520.09, the Track first-layout bounds included, so the rerun the gate note asked for is done. AC3's one deviation (Workhorse operations responsibilities, 144 -> 235 ms, from the TypeScript layout of the different packing) is accepted under the user's ruling of 2026-10-25 that small render-time differences do not matter; the corpus total fell from 18.0 s to 14.4 s.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Blocks routes its trunks with a clean-room orthogonal router in the renderer core (crates/archboard-router): a Hanan grid and an A* search with bend and crossing penalties [W09], nudging with a VPSC solver one axis at a time [D05], and routes from one pin joined until they part [W12], kept apart in a parting order whose sureness ranks hold it acyclic. Where a pin's segment crowds a channel, only its stub is kept and the routes are nudged again. libavoid-js and its patch are gone. Every corpus difference was reviewed against the measures of ADR 0039 and none reads worse; the user judged the router's pictures better across the reviewed batch. The Blocks corpus renders in 14.4 s instead of 18.0 s; one view is slower (144 to 235 ms), from the TypeScript packing, accepted by the user's ruling. An unroutable trunk keeps the dogleg fallback, and no constraint set throws. The review of 2026-10-25 found the router's interface small and deep and left one seam open: routeTrunks hand-codes a flat number array where the rest of the core uses typed serde contracts.
<!-- SECTION:FINAL_SUMMARY:END -->

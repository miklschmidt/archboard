---
id: TASK-520.02
title: >-
  A Rust orthogonal router routes the trunks of Blocks, and libavoid leaves the
  renderer
status: To Do
assignee: []
created_date: '2026-10-24 12:53'
updated_date: '2026-10-24 13:34'
labels:
  - renderer
  - performance
dependencies:
  - TASK-520.01
documentation:
  - >-
    docs/adr/0057-the-renderer-is-a-rust-core-and-each-frontend-paints-its-paint-list.md
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
- [ ] #1 Blocks routes every trunk with the router of the core, and libavoid-js and its patch are gone from the repository
- [ ] #2 No corpus picture is worse on the measures of ADR 0039 than with libavoid, and the task notes record each reviewed difference
- [ ] #3 The corpus renders faster in total and no board renders slower, measured with the same harness before and after, with the numbers in the task notes
- [ ] #4 A trunk that the router cannot route keeps the dogleg fallback of today, and an unsatisfiable constraint set never throws
- [ ] #5 The router module cites the published algorithms it implements
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research before pickup, 2026-10-24 (an Opus research agent; the claims are not yet checked at their sources, so check each before relying on it).

Papers read in full: Wybrow, Marriott and Stuckey, "Orthogonal Connector Routing" (GD 2009) [W09]; Marriott, Stuckey and Wybrow, "Seeing Around Corners: Fast Orthogonal Connector Routing" (Diagrams 2014) [M14]; Wybrow et al., "Orthogonal Hyperedge Routing" (Diagrams 2012) [W12]; Wybrow et al., "Incremental Connector Routing" (GD 2005); Dwyer, Marriott and Stuckey, "Fast Node Overlap Removal" (2005 report) [D05]. Not obtained: the VPSC correction (GD 2006). Get it before implementing satisfy_VPSC.

What archboard uses (per the agent): rectangle obstacles, orthogonal routes, shapeBufferDistance 16, idealNudgingDistance LANE 16, segment penalty 60, crossing penalty 300, directed pins with one shared pin per class, free ends for undirected trunks, the fallback ladder directed then undirected then dogleg, the unifying prepass only for crowded chosen packings, a fresh router per call. Not used: checkpoints, connection costs, exclusive pins, hyperedges, polyline routing. Track never routes with libavoid (place.ts inline), so Track pictures must stay byte-identical.

Proposed design: a pure crate packages/renderer/crates/router with modules visibility [W09 s3], search (A* over node and direction, [W09 s4], with a crossing cost of our own: no paper defines one), order [W09 s5.1], unify (junction merge [W12 s3] plus channel track assignment, replacing the pairwise prepass), nudge [W09 s5.2] and vpsc [D05 s4]. Over-full spans are found before solving and their gaps scaled, so nothing throws, and the answer reports each crowded span, which can replace crowdedTrunks, roomNeeded and the second routed pass. Determinism: no HashMap iteration, ties by input order and ids, only + - * / on f64, no NaN. The wasm crate exposes a flat f64 encoding once per packing candidate.

Open questions for the person who decides: whether the implementer may read unsatisfiable.ts, the TASK-512 notes and the libavoid-js patch, which describe libavoid internals (the clean-room rule says the router must not follow them); whether lines that share a pin keep one stroke near it; geometry that was tuned to libavoid (port-columns.ts, the insets in pack.ts); the unification always runs, so pictures change where the prepass is off today; scene sizes are unmeasured, so measure them before choosing between the [W09] graph and [M14]. The scorecard (drawn-scorecard.ts) lacks double tracks, side hooks, corner crossings and wall hugging, which the ADR 0039 comparison needs.
<!-- SECTION:NOTES:END -->

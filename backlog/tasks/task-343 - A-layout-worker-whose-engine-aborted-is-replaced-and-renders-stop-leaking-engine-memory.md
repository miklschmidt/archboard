---
id: TASK-343
title: >-
  A layout worker whose engine aborted is replaced, and renders stop leaking
  engine memory
status: To Do
assignee: []
created_date: '2026-09-24 16:29'
updated_date: '2026-09-24 17:36'
labels:
  - renderer
dependencies: []
priority: high
type: bug
ordinal: 584000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Seen 2026-09-24 twice: after a run of renders on one server (49 pictures, or under heavy load) one render fails with 'program has already aborted!' from the WASM layout engine and every later render on that worker fails the same way until the server restarts. Each failing board renders fine on a fresh server, so something accumulates across renders (likely native libavoid or Graphviz objects not deleted, growing the WASM heap until it aborts), and the engine pool never replaces the dead worker. The browser runs the same pool.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A worker whose engine aborts is replaced, and the render that hit the abort is retried once on a fresh worker
- [ ] #2 Rendering every dogfood board and view twice in a row on one server fails none of them
- [ ] #3 One test owner proves a worker is replaced after an abort
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Lead from the TASK-342 profile (2026-09-24): nativeRoutePoints in lib/layout/avoid-routes.ts never deletes the PolyLine that displayRoute() returns or the Point each at() returns. Four in-process renders of Board viewer showed no WASM memory growth (16 MiB), so embind's finalizers may reclaim them on GC; a long batch (Archboard server, about 1310 solves) is where to measure before and after deleting them. The same profile found one slow solve throwing 762,356 Avoid::UnsatisfiableException, which the TASK-342 libavoid patch now throws without a stack trace.
<!-- SECTION:NOTES:END -->

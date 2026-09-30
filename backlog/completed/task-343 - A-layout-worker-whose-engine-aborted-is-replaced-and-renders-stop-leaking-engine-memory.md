---
id: TASK-343
title: >-
  A layout worker whose engine aborted is replaced, and renders stop leaking
  engine memory
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 16:29'
updated_date: '2026-09-25 07:57'
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
- [x] #1 A worker whose engine aborts is replaced, and the render that hit the abort is retried once on a fresh worker
- [x] #2 Rendering every dogfood board and view twice in a row on one server fails none of them
- [x] #3 One test owner proves a worker is replaced after an abort
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. One engine pool for the server and the browser: move the browser's createEnginePool (a factory over a worker starter) to a root entrypoint of the semantic-renderer transformer module, which both runtime and ui may import; give its worker optional ref/unref so Bun stays alive only for pending solves; delete the server's separate module-level pool.
2. A fatal answer, or a worker that stops, discards that worker and posts each solve it held once more on a fresh worker; a solve that fails twice is refused with the engine's own error.
3. Both layout workers answer an engine abort as fatal: a WebAssembly RuntimeError, or an error whose message says the program aborted, besides a failed initialization.
4. One test owner: the pool with fake workers, the first answering fatal, proves the worker is terminated and the solve answered by a fresh one.
5. Follow the libavoid lead (avoid-routes nativeRoutePoints never deletes PolyLine/Point) and measure: render every dogfood board and view twice in one process, with WASM memory noted, before and after.
6. Gate lane by lane, then the full gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Lead from the TASK-342 profile (2026-09-24): nativeRoutePoints in lib/layout/avoid-routes.ts never deletes the PolyLine that displayRoute() returns or the Point each at() returns. Four in-process renders of Board viewer showed no WASM memory growth (16 MiB), so embind's finalizers may reclaim them on GC; a long batch (Archboard server, about 1310 solves) is where to measure before and after deleting them. The same profile found one slow solve throwing 762,356 Avoid::UnsatisfiableException, which the TASK-342 libavoid patch now throws without a stack trace.

2026-09-25: one engine pool (src/transformers/semantic-renderer/engine-pool.ts) now serves the server and the browser. A fatal answer (failed start, WebAssembly trap or aborted Emscripten runtime, both workers classify with engineAborted) or a stopped worker terminates the worker and sends each solve it held once more to another worker; a second failure is refused with the engine's words. The libavoid lead does not hold: libavoid-js uses the WebIDL binder, whose displayRoute returns a reference into the connector and whose at() reuses one temporary, so there is nothing to delete. Verified: the pool's contract test (src/transformers/semantic-renderer/tests/engine-pool.test.ts, 7 pass) covers replacement after a stop and after an abort, the retry, and the refusal on a second failure; every dogfood drawing (43) rendered three times in one process, each round laid out afresh (group names varied to pass the layout memo), with no failure under Graphviz (about 16 s a round) or Track (about 2 s); full gate at 95ee29aa: every lane passed, the system lane on a rerun after a walkthrough-recording test failed once on Chromium's window size (1920x1024 in a 1920x1223 window), unrelated and passing on rerun.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A layout worker whose engine aborts, fails to start or stops is now replaced, and the solves it held are sent once more to another worker; a second failure is refused with the engine's own words. The server and the browser share one engine pool, and both workers report WebAssembly traps and aborted runtimes as fatal. Verified by the pool's contract test (replacement after a stop and an abort, the retry, the refusal), by rendering every dogfood drawing three times in one process without failure under Graphviz and Track, and by the full gate.
<!-- SECTION:FINAL_SUMMARY:END -->

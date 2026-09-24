---
id: TASK-343
title: >-
  A layout worker whose engine aborted is replaced, and renders stop leaking
  engine memory
status: To Do
assignee: []
created_date: '2026-09-24 16:29'
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

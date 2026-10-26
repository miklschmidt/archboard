---
id: TASK-548.01
title: The core runs Graphviz itself, and viz-js leaves the renderer
status: To Do
assignee: []
created_date: '2026-10-26T02:27:00Z'
updated_date: '2026-10-26T02:30:00Z'
labels:
  - renderer
  - performance
dependencies: []
parent_task_id: TASK-548
ordinal: 934000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ADR 0057 kept Graphviz with the host "for now" and left replacing it to a separate decision. The spike on local branch spike/graphviz-pure (commits 6e13a06e1..b708f3905, notes in /tmp/spike-gvpure) showed that graphviz-pure 0.2.0 inside the core, with musl's qsort tie order and an exact fast fma for WebAssembly, answers all 222 captured Graphviz graphs exactly as viz-js does and changes 0 of 2,344 corpus drawings. Upstream graphviz-pure copies macOS libc's qsort on purpose (graphviz-pure-layout/src/cutil.rs:237), which changed 276 drawings. The owner chose to vendor the needed crates into this repository under their EPL-2.0 license. Moving Graphviz into the core also removes the C dependency of a future native frontend and makes a solve's Graphviz answers depend on their input alone.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An ADR records that the core lays graphs out with the vendored graphviz-pure, and why (musl tie order, exactness, the spikes' findings), and ADR 0057 points to it
- [ ] #2 The vendored crates carry their EPL-2.0 license and THIRD_PARTY_NOTICES.md names them
- [ ] #3 No package of the renderer depends on @viz-js/viz, and no worker loads it
- [ ] #4 Every drawing of the corpus is unchanged against feat/rust-desktop-frontend
- [ ] #5 A native build of the core lays a board out with no C library and no host Graphviz
- [ ] #6 Rendering works in Bun and in the browser
- [ ] #7 The renderer's focused tests (bun test packages/renderer) and cargo test for the changed crates pass
<!-- AC:END -->

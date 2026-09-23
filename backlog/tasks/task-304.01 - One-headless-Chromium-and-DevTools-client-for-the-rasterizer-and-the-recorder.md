---
id: TASK-304.01
title: One headless Chromium and DevTools client for the rasterizer and the recorder
status: To Do
assignee:
  - '@claude'
created_date: '2026-09-23 10:31'
labels:
  - cli
  - runtime
dependencies: []
parent_task_id: TASK-304
ordinal: 531000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
semantic rasterize owns the repository's only product code that launches Chromium and speaks DevTools (src/runtime/semantic-rasterizer/lib/chromium.ts, devtools.ts). The recorder needs the same launch and cleanup guarantees (ADR 0020: private profile, loopback control, process-group cleanup), plus Chrome flags of its own, a window it can size, a browser-level connection, and a way to stream a large Blob out of the page. Module boundaries forbid importing another module's lib/, so the shared part has to become a module of its own.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A runtime module launches a private headless Chromium with caller-supplied extra flags, opens a page target, connects to it and to the browser target, and tears the process group down provably
- [ ] #2 Its DevTools client can listen for events without keeping every event in memory, evaluate with a user gesture, and stream a page Blob to a file through IO.resolveBlob and IO.read
- [ ] #3 semantic rasterize runs on it with no change in behaviour, and its tests still pass
<!-- AC:END -->

---
id: TASK-304.01
title: One headless Chromium and DevTools client for the rasterizer and the recorder
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 10:31'
updated_date: '2026-09-23 12:38'
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
- [x] #1 A runtime module launches a private headless Chromium with caller-supplied extra flags, opens a page target, connects to it and to the browser target, and tears the process group down provably
- [x] #2 Its DevTools client can listen for events without keeping every event in memory, evaluate with a user gesture, and stream a page Blob to a file through IO.resolveBlob and IO.read
- [x] #3 semantic rasterize runs on it with no change in behaviour, and its tests still pass
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Move chromium.ts and devtools.ts from the rasterizer into src/runtime/headless-chromium (launch with caller flags, browser-level connection, openWindow at an exact viewport, bounded event retention, on(), userGesture evaluate, readBlobTo streaming), switch the rasterizer to it unchanged; after review, one discovery honouring ARCHBOARD_RENDERER_CHROMIUM, truncate before streaming, fitWindow for the sharing bar.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built by an implementer (0b930a5f), reviewed (approve with should-fixes), merged fec7e8e2. Review fixes in eea243ac: ARCHBOARD_RENDERER_CHROMIUM read where Chromium is discovered (the missing-browser message names it), readBlobTo truncates first (test pre-fills a longer file). fitWindow added in c307fe78 for the tab-sharing bar.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Chromium launch and DevTools moved out of the rasterizer into src/runtime/headless-chromium: private profile, caller flags, a browser-level connection, openWindow at an exact viewport (plus fitWindow for the tab-sharing bar), bounded event retention, on(), userGesture evaluate and readBlobTo streaming a page Blob (truncating first). One discovery honours ARCHBOARD_RENDERER_CHROMIUM. The rasterizer runs on it unchanged. Verified by the module's owner (exact viewport, listener delivery without retention, a 3 MiB Blob streamed over a longer file, provable teardown), the unchanged rasterizer owners and rasterize system owner, the recorder's end-to-end owner, and the full bun run check (exit 0).
<!-- SECTION:FINAL_SUMMARY:END -->

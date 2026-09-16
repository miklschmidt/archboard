---
id: TASK-247
title: >-
  Render architecture pictures in the browser, with the same renderer the CLI
  uses
status: To Do
assignee: []
created_date: '2026-09-16 19:42'
updated_date: '2026-09-16 19:51'
labels:
  - renderer
  - frontend
  - performance
dependencies: []
references:
  - docs/adr/0023-semantic-boards-own-meaning-renderers-own-presentation.md
  - src/runtime/semantic-renderer/lib/layout/engine-pool.ts
  - src/server/canvas/lib/semantic-board-routes.ts
ordinal: 434000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The canvas asks the server for every picture (/api/semantic-boards/render), and the server lays it out in Bun workers. A first render settles several candidate drawings (readings, flank rules, label reservations), and on 2026-09-16 that took up to a second on the server (TASK-245.09). The user wants pictures drawn in the browser, where the candidates can solve in parallel Web Workers, while Bun rendering stays for the CLI, rasterizing and other programmatic uses. The same renderer code must run in both places; only the transport (render route versus in-page call) and the worker mechanism (Bun Worker versus Web Worker) differ. Worker counts are detected from the host (navigator.hardwareConcurrency in the browser, os.availableParallelism under Bun), never fixed for one machine; macOS and Linux are both supported. ADR 0023 keeps the board file the single source of truth; the user clarified on 2026-09-16 that drawing in the browser does not break that when the browser holds a variant content as a read-only cache, invalidated when the server announces a board change, the same way the drawing query is invalidated today. Record that reading as an amendment or note to ADR 0023.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An architecture picture drawn in the browser is identical to the one the Bun renderer draws for the same variant, theme and predecessors
- [ ] #2 The renderer core has one implementation used by both; the browser and Bun differ only in transport and worker mechanism
- [ ] #3 Worker pools size themselves from the host core count in both environments
- [ ] #4 Board content in the browser is a read-only cache invalidated by the server board announcements, and ADR 0023 records why that keeps one source of truth
- [ ] #5 The canvas first picture of a board is measured against the server-rendered baseline and recorded
- [ ] #6 Background pre-rendering: when the server announces that a board changed, the browser renders its affected variants in the background rather than waiting for someone to navigate to them
- [ ] #7 Rendered pictures are cached in localStorage, keyed so a changed board, variant, view, theme or renderer version misses the cache
- [ ] #8 On page load the localStorage render cache is checked for invalidation against the server board versions before any cached picture is shown
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User asked on 2026-09-16 to include background pre-rendering: render diagrams in the background when they change, cache them in localStorage, and check that cache for invalidation on page load.
<!-- SECTION:NOTES:END -->

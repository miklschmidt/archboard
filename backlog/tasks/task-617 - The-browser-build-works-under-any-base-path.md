---
id: TASK-617
title: The browser build works under any base path
status: Done
assignee:
  - '@claude'
created_date: 2026-11-09 01:20
updated_date: '2026-11-09T05:27:00Z'
labels:
  - frontend
dependencies: []
references:
  - vite.config.ts
  - apps/web/src/ui/panes/reading-routing/components/ReadingRoutingHost.tsx
  - packages/renderer/src/ui/state/diagram-icons.ts
ordinal: 1063000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The browser build assumes that it is served at the root of its host. Absolute paths such as /assets/diagram-icons and a router without a base path break a copy of the build served under a sub-path, which is how static hosts such as GitHub Pages serve a project.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The build uses a relative base, so every asset, worker and .wasm URL resolves against the page
- [x] #2 The router and the icon URL follow the base of the document
- [x] #3 The app that the local server serves at the root keeps working
- [x] #4 One browser owner serves a build under a sub-path and draws a picture there
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Set the Vite base to './' so the built index.html, the layout worker and the .wasm files resolve against the page.
2. Give the router the base path of the document: the directory of document.baseURI. At the root this is '/', so the local server's app is unchanged.
3. Build the icon URL against document.baseURI in one exported function of the renderer's browser interface, and use it from both icon readers (the renderer's icon loader and the shell's legend and level-mark query).
4. Accept the './assets/' entry script that a relative base writes in the stale-tab check of server-lifecycle, and update its system owner.
5. Add one browser owner to browser-drawn-pictures.test.ts: a loopback proxy serves the build under /sub/ (stripping the prefix) and passes /api and the sockets through; the page draws a model there, fetches the icons and the worker under /sub/, and keeps /sub/ in its address.
6. Check the app under a sub-path and at the root with agent-browser and screenshots, then run the relevant lanes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Build: vite.config.ts sets base './'. The built index.html names ./assets/, and the preload helper, the layout worker, both .wasm cores and the CSS fonts resolve with new URL(..., import.meta.url) or ./ paths.

Router: ReadingRoutingHost gives TanStack Router the basepath new URL('.', document.baseURI).pathname. At the root of the Archboard server this is '/', so the local app is unchanged. Decision: the directory of the base, not the full page path, because a static host serves a project's directory and Vite's relative base resolves assets against that directory.

Icons: both icon readers (packages/renderer/src/ui/state/diagram-icons.ts and the shell's iconQuery in queries.ts) fetch the relative 'assets/diagram-icons/<name>.json'. fetch resolves a relative URL against the document's base, so no helper or new export is needed. Both run on the main thread, never in a worker.

Stale-tab check: the built entry is now ./assets/index-<hash>.js. server-lifecycle's staleness rule accepts ./assets/ and still accepts /assets/, so a tab opened before this change is told to reload once. tests/system/server-state/staleness-frontend.test.ts plants and expects the relative form.

Left as is: /api requests and the two sockets stay root-anchored. They belong to the Archboard server, and TASK-618's snapshot page sends none.

Site audit: not needed. The site imports only the painter and the fonts of packages/renderer, not the icon loader or the router, and nothing drawn or shown changes.

Checked by looking: agent-browser on a scratch server with examples/web-shop, behind a loopback host that serves it under /project/. The page drew the model with icons in dark and light themes, kept /project/ while navigating to a module, and the root of the server still worked.

Gate (inside nix develop, one lane at a time): format:check, types, lint:tests, lint:policy pass; test:repository 170 pass; test:modules 5029 pass; test:system 280 pass; test:serial-browser 71 tests pass, exit 0. The sub-path owner fails, as it should, when the router's basepath is forced to '/' (checked once by hand).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The browser build now works under any base path. vite.config.ts sets a relative base, so the built page names ./assets/ and every asset, worker, .wasm core and font resolves against the page. The router takes the directory of document.baseURI as its basepath, and both icon readers fetch the relative assets/diagram-icons/<name>.json, which resolves against the document's base. At the root of the Archboard server all of this resolves as before. The stale-tab check accepts the relative entry script, and still tells a tab that loaded a root-anchored build to reload.

Proof: browser-drawn-pictures.test.ts 'a build served under a sub-path loads its assets there and draws a model' serves the build under /project/ through a loopback host and checks that the model is drawn with its icons, that every asset came from /project/assets/, and that the address stays at /project/. The existing owners of the root app, including the first test of that file and staleness-frontend.test.ts, pass. The full gate lanes pass.

Follow-up for TASK-618: /api requests and the two sockets stay root-anchored, because only the Archboard server answers them.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: TASK-617
title: The browser build works under any base path
status: Done
assignee:
  - '@claude'
created_date: 2026-11-09 01:20
updated_date: '2026-11-10T15:15:00Z'
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
1. Set the Vite base to './' so built assets, the layout worker, and the .wasm files resolve against the page.
2. Give the router the directory of document.baseURI as its base path. Accept an explicit index.html as the directory route.
3. Fetch assets/diagram-icons/<name>.json relative to the document base in both browser icon readers. Use the shared policy naming rule and the existing server lookup. No URL helper or new export is needed.
4. Accept the './assets/' entry script in the stale-tab rule, and retain support for the prior '/assets/' entry.
5. Extend browser-drawn-pictures.test.ts with a loopback proxy under /project/. Keep the live server for API requests, sockets, and dynamic icon responses. Assert the asset paths, drawing, and router address.
6. Exercise the relocated app and the root app, then run the relevant lanes and site audit.
7. Keep boundaries.md and the Workspace router and Icon loading modules accurate. This task relocates a live app. It does not implement snapshot ingestion or a server-free reader. The boundary review documents implemented behavior, so no proposal is needed.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Build: vite.config.ts sets base './'. The built index.html names ./assets/, and the preload helper, the layout worker, both .wasm cores and the CSS fonts resolve with new URL(..., import.meta.url) or ./ paths.

Router: ReadingRoutingHost gives TanStack Router the basepath new URL('.', document.baseURI).pathname. At the root of the Archboard server this is '/', so the local app is unchanged. Decision: the directory of the base, not the full page path, because a static host serves a project's directory and Vite's relative base resolves assets against that directory.

Icons: both icon readers (packages/renderer/src/ui/state/diagram-icons.ts and the shell's iconQuery in queries.ts) fetch the relative 'assets/diagram-icons/<name>.json'. fetch resolves a relative URL against the document's base, so no helper or new export is needed. Both run on the main thread, never in a worker.

Stale-tab check: the built entry is now ./assets/index-<hash>.js. server-lifecycle's staleness rule accepts ./assets/ and still accepts /assets/, so a tab opened before this change is told to reload once. tests/system/server-state/staleness-frontend.test.ts plants and expects the relative form.

Left as is: /api requests and the two sockets stay root-anchored. They belong to the Archboard server.

Site audit (PR #86 review, 2026-11-10): completed the required asset rebuild and browser inspection. Repainted the live pictures and regenerated all seven site diagrams. The refreshed SVGs include the current renderer legends and behavioral flow drawings. Inspected every site section and the module opening and return. Inspected three grammars, three evidence tabs, both proposal readings, both claims states, and all four walkthrough beats. Played the conversation demo to its end. Compared the shell mocks and diagram highlights with examples/web-shop in the running app. No source adjustment was needed. Screenshots are in /tmp/pr86-audit-images. The WebGL hero animation could not be assessed: Chromium returned no WebGL2 context, including with software-renderer flags. Live painter drawings and the other demos rendered. This is a browser capability limit, not evidence of a PR regression.

Checked by looking: agent-browser on a scratch server with examples/web-shop, behind a loopback host that serves it under /project/. The page drew the model with icons in dark and light themes, kept /project/ while navigating to a module, and the root of the server still worked.

Gate (inside nix develop, one lane at a time): format:check, types, lint:tests, lint:policy pass; test:repository 170 pass; test:modules 5029 pass; test:system 280 pass; test:serial-browser 71 tests pass, exit 0. The sub-path owner fails, as it should, when the router's basepath is forced to '/' (checked once by hand).

Review scope: b0ec1a9c9c...43aba6b001. Standards found the omitted mandatory site audit. Spec found no product defect. The Browser (vKEsyHFk/vKEsyHFk#6nZjwK9W) and renderer (vKEsyHFk/vKEsyHFk#OHywsFXm) keep the same responsibilities and contracts. This review changes audit evidence and published drawings only, so no architecture proposal is needed.

Review validation: root build passed inside nix develop. Focused browser owners passed 7 tests across 3 files. The frontend staleness owner passed 1 test. Types, test lint, policy lint, and formatting passed. Site guide tests passed 8 tests. Astro reported zero errors, warnings, or hints, and all internal links across 17 pages resolved. The root build retains its existing large-chunk advisory. Manual inspection covered a nested base path, explicit index.html, scoped deep links, reload, Back, Forward, both themes, and the built app at the root.

Boundary review with PR #87: the two edits of diagram-icons.ts compose without a conflict. Snapshot names and browser names share iconsNamedBy; the server route uses the same iconPaths lookup as the snapshot. Corrected the obsolete exported URL helper in the plan, documented the actual base-path contract in boundaries.md, and updated Workspace router (vKEsyHFk#4DTJtXk6) and Icon loading (vKEsyHFk#pEFBxTks) through the CLI. No runtime correction was needed. Root and sub-path browser owners: 2 pass, 0 fail. Frontend staleness owner: 1 pass, 0 fail. check:model and format:check pass. Architecture evidence retains 84 exposure-unknown subjects, 9 unbound subjects, and 1 text-only checkout as skips. The browser build retains its existing chunk-size advisory. Static-only probe: /project/ returns 200, but /project/assets/diagram-icons/RiServerLine.json and /api/architecture/model return 404. No browser code consumes ModelSnapshotSchema or snapshot.icons; model reads and both sockets still use live root API paths. The proxy browser owner does not prove a server-free snapshot reader. That combined goal remains incomplete, although the individual task criteria are met. This boundary review does not expand either task into a new reader implementation.

Cross-branch contract probe: all 18 icon entries from a snapshot written by PR #87 match the JSON paths served through the browser icon route under /project/ from PR #86. No names or paths differ.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The browser build now works under any base path. vite.config.ts sets a relative base, so the built page names ./assets/ and every asset, worker, .wasm core and font resolves against the page. The router takes the directory of document.baseURI as its basepath, and both icon readers fetch the relative assets/diagram-icons/<name>.json, which resolves against the document's base. At the root of the Archboard server all of this resolves as before. The stale-tab check accepts the relative entry script, and still tells a tab that loaded a root-anchored build to reload.

Proof: browser-drawn-pictures.test.ts 'a build served under a sub-path loads its assets there and draws a model' serves the build under /project/ through a loopback host and checks that the model is drawn with its icons, that every asset came from /project/assets/, and that the address stays at /project/. The existing owners of the root app, including the first test of that file and staleness-frontend.test.ts, pass. The full gate lanes pass.

Boundary review corrected the plan, module boundary guide, and architecture records. Relocation with a live server passes 2 browser tests and 1 staleness test. Architecture and formatting pass. The pair still lacks snapshot ingestion and an offline icon source, so it does not yet deliver the server-free reader goal.
<!-- SECTION:FINAL_SUMMARY:END -->

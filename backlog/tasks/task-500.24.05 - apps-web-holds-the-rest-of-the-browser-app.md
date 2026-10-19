---
id: TASK-500.24.05
title: apps/web holds the rest of the browser app
status: Done
assignee: []
created_date: '2026-10-19 18:24'
updated_date: '2026-10-19 21:37'
labels: []
dependencies:
  - TASK-500.24.04
parent_task_id: TASK-500.24
ordinal: 906000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Second web step: the remaining src/ui modules (application, shell, pane-session, board-routing, board-catalog, board-move, walkthrough-recording and replay, vault-diagnostics, types, theme), frontend/main.tsx, index.html, favicon and renderer-build.d.ts move into apps/web; vite.config.ts takes apps/web as root with output at dist/frontend; app.css and the WASM URL are rebased. Read docs/design/apps-migration.md.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 apps/web holds the whole browser app, vite.config.ts, tsconfig.frontend.json, components.json and the theme paths name the new locations, and the temporary #web/* entry is no longer used
- [x] #2 The frontend build, the dev-mode stylesheet and Fast Refresh check and the full test:serial-browser lane pass
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read docs/design/apps-migration.md, boundaries.md (Apps, apps/web), frontend.md and the canvas step (0c77adcee and its three fix commits).
2. List every import leaving the moved modules: only @archboard/* exports, libs and moved modules; relative imports none.
3. Unbarrel the eleven re-export files of src/ui (index, api shims, core, actions, workspace-port, pane-subtitles) and split the mixed shell index by (old subpath, name); move the two functions the recording and replay indexes held into their own files first.
4. Map every file to apps/web/src/ui/<role>/<behavior>/ (rules, state, clients, components, hooks) and its test to apps/web/tests/ui/<role>/<behavior>/; main.tsx, index.html, favicon.svg beside src; renderer-build.d.ts to clients/renderer-build; the recorder address test to apps/web/tests/contracts. Rewrite importers with a script; #web/ becomes # inside the app.
5. Vite root apps/web, output dist/frontend, drop the @ alias, sourceRoot and stylesheetBeyondRoot; fs.allow the repository root. Rebase app.css (@import, fonts, @source with source(none)) and the libavoid URL; update components.json, tsconfigs, package.json scripts and imports, .impeccable, readme manifest, frontend-build, docs.
6. Verify: both tsc, lint, fmt:check, bun test apps/web, repository tests, build CSS identical, dev server (stylesheet, Fast Refresh, /@fs), test:serial-browser, a real server run, then bun run check.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
apps/web holds the whole browser app (about 200 more files, main.tsx, index.html, theme) in role folders with tests in apps/web/tests; Vite takes apps/web as root and builds to dist/frontend; the root #web/* entry is gone. Codex reviewed d4b44ece0 with the code-review skill and fixed three findings (44e6839fe role placement of six modules, d6424c9de shadcn paths and guidance); 1,796 bindings matched, CSS byte-identical with all 1,197 classes, 84 test files preserved. bun run check exited 0 on the move including the real-Chrome lane.
<!-- SECTION:FINAL_SUMMARY:END -->

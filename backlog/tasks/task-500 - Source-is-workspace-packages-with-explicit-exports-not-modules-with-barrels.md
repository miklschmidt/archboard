---
id: TASK-500
title: 'Source is workspace packages with explicit exports, not modules with barrels'
status: Done
assignee: []
created_date: '2026-10-18 22:45'
updated_date: '2026-10-19 23:31'
labels: []
dependencies: []
references:
  - docs/design/package-map.md
ordinal: 865000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
110 modules in src were too shallow: 97 of 99 index.ts files only re-export, and the area folders cut each behavior in pieces. docs/design/package-map.md maps them to 16 packages and 3 apps. Each package names its interface in package.json exports, keeps its area and role folders inside, and keeps internal tests next to its code.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every package in docs/design/package-map.md exists under packages/ with a package.json exports interface and no index.ts barrel
- [x] #2 Lint refuses a deep import into another package and a server subpath imported from browser code
- [x] #3 src holds no module, and the three apps hold only entrypoints and glue
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The 110 modules of src are 16 workspace packages (packages/*) and 3 apps (apps/cli, apps/server, apps/web); each package names its interface in package.json exports, with area and role folders inside, internal tests beside its code, no index.ts barrel, and # imports in place of relative imports and the @/ alias. Lint and the repository tests refuse deep imports, upward and cyclic package edges, app imports and browser reach into server code. Every step was reviewed by Codex with fixes applied; a final whole-branch review fixed eight more findings and added ADR 0055. The final bun run check on e462ec210 exited 0 (all lanes, 19 browser files). Open follow-ups: TASK-501 (79 anchor warnings on the boards), stale README assets (need the human Codex flow), and the Vite+ / vp test and Bun-Vitest trial tasks.
<!-- SECTION:FINAL_SUMMARY:END -->

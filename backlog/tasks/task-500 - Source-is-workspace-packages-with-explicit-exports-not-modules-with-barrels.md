---
id: TASK-500
title: 'Source is workspace packages with explicit exports, not modules with barrels'
status: To Do
assignee: []
created_date: '2026-10-18 22:45'
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
- [ ] #1 Every package in docs/design/package-map.md exists under packages/ with a package.json exports interface and no index.ts barrel
- [ ] #2 Lint refuses a deep import into another package and a server subpath imported from browser code
- [ ] #3 src holds no module, and the three apps hold only entrypoints and glue
<!-- AC:END -->

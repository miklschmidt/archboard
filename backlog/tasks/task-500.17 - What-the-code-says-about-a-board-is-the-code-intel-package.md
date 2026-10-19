---
id: TASK-500.17
title: What the code says about a board is the code-intel package
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-19 11:09'
updated_date: '2026-10-19 11:40'
labels: []
dependencies:
  - TASK-500.14.04
parent_task_id: TASK-500
ordinal: 886000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
code-intel is layer 5: runtime/code-facts (20,055 lines), code-check, history-lens, language-servers and the shared code-check, history-attribution, footprint and locality. The canvas imports shared/code-check, so the package needs a browser-safe api file with no node: import.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/code-intel holds the eight modules in shared/ and runtime/ role folders with api files, the browser-reachable ones free of node: imports
- [ ] #2 Its tests live in the package, outside code uses only its curated api interface files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/code-intel (layer 5) created with curated api files from the start: shared/ (code-check, history-attribution, footprint, locality: browser-used, node-free) and runtime/ (code-facts, code-check, history-lens, language-servers). Move whole directories with git mv, including non-TypeScript assets and test fixtures (tree-sitter query files read with new URL(query, import.meta.url) in code-facts/lib/grammars.ts, test fixture trees), and keep import.meta.resolve of the wasm and Bun.resolveSync("typescript/package.json", import.meta.dir) working from the new location.
2. Role folders from content (runtime: operations, clients for language servers, services, store; shared: schemas, rules, constants, protocol). Barrel index.ts files deleted; api files curated per capability from the importers (scan scripts in /tmp/pm/api), the browser-reachable api files carry no node: import (trace + build:frontend).
3. Depends only on lower packages (timing, diagnostics, process, workspace, code-binding, board); package-graph test layer 5 stays valid. Tests move into the package; ci.yml, evals/coverage.json, docs/readme/assets.json (4 source lists name code-check, code-facts, history-lens), docs and skills name the new paths. bun run check.
<!-- SECTION:PLAN:END -->

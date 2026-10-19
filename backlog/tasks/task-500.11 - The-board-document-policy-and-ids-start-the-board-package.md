---
id: TASK-500.11
title: 'The board document, policy and ids start the board package'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 04:29'
updated_date: '2026-10-19 04:57'
labels: []
dependencies:
  - TASK-500.09
  - TASK-500.10
parent_task_id: TASK-500
ordinal: 876000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
board is layer 4 of docs/design/package-map.md: the board document and its one reader and writer. The shared half goes first because the browser uses it (shared/semantic-board is imported by 347 files): shared/semantic-board, shared/semantic-policy, shared/ids, shared/semantic-pane-context. It imports the binding, anchor and document-reference schemas from code-binding. Runtime/engine holds nothing the shared half needs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 packages/board holds the four shared modules in shared/ role folders with a few exports (document, policy, ids and pane context as the importers need them), no barrel, and every importer uses @archboard/board
- [x] #2 Every export the browser reaches holds no node: import, proven by a trace from frontend and src/ui plus build:frontend
- [x] #3 The tests of the moved code live in packages/board/tests, and ids stay defined once in the package (CLAUDE.md: no second site mints an id)
- [x] #4 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/board, same shape as the other packages. Depends only on timing, diagnostics, process, workspace, code-binding (the binding, anchor and document-reference schemas come from @archboard/code-binding/code-binding). No @/ import.
2. Move shared/semantic-board (index.ts, draft-ref.ts, lib/* 30 files, tests/*), shared/semantic-policy, shared/ids/ids.ts, shared/semantic-pane-context into packages/board/src/shared/ role folders from content: schemas (content, input, primitives, vocabulary, semantic-value, draft-ref shapes), rules (reconcile*, compare*, integrity, scope, views, groups, listing, resolution ...), constants (ids, policy tables). Split a folder past about 12 files by behavior (for example rules/reconcile and rules/compare) and name files for what they do, not index.ts.
3. index.ts files of semantic-board, semantic-policy and semantic-pane-context are forwarding barrels (re-exports of lib files): delete them and point importers at the defining files, as in the codex-app-server tasks (unbarrel script /tmp/pm/cas2/unbarrel.ts is the example). Compare each barrel exported names with the real files so no name changes definition and no schema is duplicated.
4. exports: the minimum that code outside the package imports, grouped by what importers need; report the count. Browser-reachable ones hold no node: import (trace + build:frontend). Ids stay defined once; update AGENTS.md (CLAUDE.md symlinks to it) where it names src/shared/ids/ids.ts.
5. Tests move to packages/board/tests/shared/<role>/. Update docs/agents/boundaries.md, skills, ci.yml, evals/coverage.json, vite.config.ts and other mentions of the old paths. bun run check.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
packages/board starts with the shared half: 34 source files and 17 tests under schemas, protocol and rules (coherence, compare, inspect, reconcile). Only semantic-board/index.ts was a barrel (deleted, with parseSemanticBoard moved to rules/coherence/parse-board.ts); semantic-policy and semantic-pane-context hold real code and moved as files. 366 importers were unbarreled by script, 16 redirected where reconcile/variant.ts and integrity.ts re-exported foreign names (that re-export caused an initialization cycle, now gone), and every export loads alone in a fresh process. The package has 28 exports. Codex verified all 272 old names, 1,428 named imports, 129 schemas defined once, no cycle, and a browser trace of 13 board subpaths with 0 node: imports. bun run check passed. Codex found no defect, and said 28 near-file-level subpaths is an interim surface: five exist only for the store (integrity, positions, primitives, reconcile-candidate, reconcile) and go private in TASK-500.12; later consolidation is TASK-500.14.
<!-- SECTION:FINAL_SUMMARY:END -->

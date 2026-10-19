---
id: TASK-500.14.01
title: Board browser-safe code is a few public interface files
status: Done
assignee:
  - '@claude'
created_date: '2026-10-19 09:18'
updated_date: '2026-10-19 09:44'
labels: []
dependencies: []
parent_task_id: TASK-500.14
ordinal: 880000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
board exposes 23 browser-safe subpaths, one per file that outside code imports. The Codex review of TASK-500.11 and .12 groups them into 11 interfaces: document (document, parse-board, draft-ref), content (content, walkthrough), flow (flow definitions of views, flow-steps), views (view definitions, scope, groups), policy (policy, vocabulary, the pure diagnostic helpers now exposed through runtime subject), comparison (drawing, compare-variants), container-interface (container-interface, compare-interfaces), commands (board-input, resolution-input, board-move), presentation (board-listing, pane-context, render-reply), plus reconciliation and ids unchanged. reconciliation schemas must stay independent of the reconciliation algorithm (an earlier initialization cycle).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 packages/board exports the browser-safe interfaces above (about 11 subpaths instead of 23), each a file that either defines or curates only the names outside code imports, and every other name is private
- [x] #2 No import cycle inside the package, every export loads alone in a fresh process, the browser trace reaches no node: import
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Role folder packages/board/src/shared/api: the public interface files, the only files that `exports` names for the shared area. A curated api file re-exports only the names that code outside packages/board imports today (type exports stay `export type`; no `export *`), from private files in schemas, protocol and rules. Private production files never import an api file. Document the api role in docs/agents/boundaries.md and in the Target shape of docs/design/package-map.md. Add one repository test (in tests/system/repository-policy/package-graph.test.ts or a neighbour): for board, every export that points into src/shared points into src/shared/api, and no private production file imports an api file.
2. Thirteen api files (Codex grouping after checking importers): document (document, parse-board, draft-ref, VariantLifecycle with its schema; about 23 names), content (content, walkthrough, EdgeEmphasis, the six group names; about 21), flow (flow-steps, flow definitions of views, MessageKind; about 10), views (remaining views, scope, DiagramGrammar with its schema; about 7), policy (policy and the rest of vocabulary; about 15), comparison (drawing, compare-variants; about 12), container-interface (container-interface, compare-interfaces; about 8), commands (board-input, resolution-input, board-move; about 20), render-reply (about 28), pane-context (about 10), board-listing (about 5), reconciliation (5, schemas stay independent of the reconciliation algorithm), ids (1). No file above about 40 names.
3. package.json exports for shared: only api files, old shared exports removed. Rewrite outside importers by (old subpath, exported name) with a script (/tmp/pm/board/regroup.ts), preserving aliases and the type or value form. Keep the names that only outside tests import (VariantContentSchema, SemanticVariantSchema, SharedSymbol, WalkthroughBeatSchema) public; tests get no private access. Also fix any filesystem-path or dynamic import of a shared private file (grep the repo: tests/system fixtures included).
4. Runtime exports stay as they are (.02). Check every export loads alone in a fresh process, no value cycle among package files, browser trace reaches no node: import, bun run build:frontend. The max-lines lint limit is 600. bun run check.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
packages/board exposes its shared half through 13 curated api files in src/shared/api (165 names, only re-exports, no moved declarations): document 23, content 21, flow 10, views 7, policy 15, comparison 12, container-interface 8, commands 20, render-reply 28, pane-context 10, board-listing 5, reconciliation 5, ids 1. Shared exports went from 23 to 13 (total 43 to 33). 166 importer files (576 import statements) were rewritten by name with a script. Codex verified 630 bindings keep their definition, alias and type/value form, every export loads alone and in six import orders, no value cycle, browser trace 805 modules with 0 node: imports, every public name has an outside caller and one owner. A new repository test (package-api.test.ts) holds the rules: exports of an area point only into its api folder, no private production file imports an api file (by # specifier or by the package name; Codex found the second gap and it is closed), no api file uses export *. bun run check passed on 670c8506d.
<!-- SECTION:FINAL_SUMMARY:END -->

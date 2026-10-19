---
id: TASK-500.14.01
title: Board browser-safe code is a few public interface files
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-19 09:18'
updated_date: '2026-10-19 09:19'
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
- [ ] #1 packages/board exports the browser-safe interfaces above (about 11 subpaths instead of 23), each a file that either defines or curates only the names outside code imports, and every other name is private
- [ ] #2 No import cycle inside the package, every export loads alone in a fresh process, the browser trace reaches no node: import
- [ ] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. New role folder shared/api in packages/board: the package public interface files and the only files exports names (add this rule to docs/agents/boundaries.md and the Target shape of docs/design/package-map.md). Files (Codex grouping): document (document, parse-board, draft-ref), content (content, walkthrough), flow (flow definitions of views, flow-steps), views (the rest of views, scope, groups), policy (policy, vocabulary), comparison (drawing, compare-variants), container-interface (container-interface, compare-interfaces), commands (board-input, resolution-input, board-move), presentation (board-listing, pane-context, render-reply), reconciliation and ids as their own interfaces.
2. Each api file re-exports from private files only the names that code outside packages/board imports today (grep every importer; type exports stay export type). Names no outside file imports are not re-exported and stay private. Private files never import api files. Do not move declarations unless a group is already one small file.
3. package.json exports: only api files, old exports removed. A script (/tmp/pm/board/regroup.ts) rewrites each outside import by NAME to the api interface that exports it; read the diff.
4. Runtime exports stay as they are in this task (they are .02). The pure diagnostic helpers of runtime subject join policy in .02.
5. Browser trace, fresh-process load of every export, no cycle, boundaries.md and package-map Target shape updated. bun run check.
<!-- SECTION:PLAN:END -->

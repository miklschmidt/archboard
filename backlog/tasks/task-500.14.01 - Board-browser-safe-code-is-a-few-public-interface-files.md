---
id: TASK-500.14.01
title: Board browser-safe code is a few public interface files
status: To Do
assignee: []
created_date: '2026-10-19 09:18'
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

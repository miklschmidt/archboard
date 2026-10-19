---
id: TASK-500.23.03
title: Workbench runtime coordinator and workhorses
status: Done
assignee: []
created_date: '2026-10-19 14:13'
updated_date: '2026-10-19 15:32'
labels: []
dependencies:
  - TASK-500.23.02
parent_task_id: TASK-500.23
ordinal: 896000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Third move: codex-coordinator, codex-workhorse-operations, codex-coordinator-callbacks, codex-coordinator-tools, codex-spoken-approval and codex-workhorse-start. They import the foundation of 500.23.02 and each other (callbacks, tools and spoken approval import the coordinator). After this move no runtime/codex-* module that belongs to the workbench is left in src/runtime.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 packages/workbench/src/runtime holds the six modules in role folders with api files, and no workbench runtime/codex-* module is left in src/runtime
- [x] #2 Its tests move into packages/workbench/tests, outside code uses only the curated api files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Move the six modules (104 files) into packages/workbench/src/runtime/{protocol,rules,services,operations,state}/<concept>/ and tests/runtime/. No outside edge blocks it: the six import only each other, the .02 foundation, codex-app-server, board, timing. Two curated api files: ./coordinator (coordinator, callbacks, tool calls, spoken approval) and ./workhorses (operations, start). Inside the package import defining #runtime files; delete the six barrels; hand-fix the data file path of tell_coordinator with import.meta.resolve; update boundaries.md, package-map, two design docs and the archboard-dev skill.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The coordinator, callbacks, tools, spoken-approval, workhorse operations and workhorse start (104 files) live in packages/workbench/src/runtime behind ./coordinator and ./workhorses; no workbench module is left in src/runtime. Codex reviewed 425347525 with no findings (1,965 bindings compared). bun run check exited 0.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: TASK-500.23.04
title: 'Workbench server: server/codex-workbench'
status: Done
assignee: []
created_date: '2026-10-19 14:14'
updated_date: '2026-10-19 15:53'
labels: []
dependencies:
  - TASK-500.23.03
parent_task_id: TASK-500.23
ordinal: 897000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Fourth move: server/codex-workbench (11,500 lines): the routes, sessions and lifecycle that run the Codex workbench in the server. It imports the runtime and shared modules of the earlier moves.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 packages/workbench/src/server holds server/codex-workbench in role folders with an api file that the server wiring uses, and server/codex-workbench is gone
- [x] #2 Its tests move into packages/workbench/tests, outside code uses only the curated api files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [x] #3 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. List every import of src/server/codex-workbench: only itself, @archboard/workbench api files, codex-app-server, timing, node:crypto and zod (verified).
2. Lay it out under packages/workbench/src/server/{protocol,rules,projections,services,operations}/<concept>/ and tests/server/... with the shared fixtures in tests/server/support/gateway/.
3. Rewrite the barrel importers by name to four api files (gateway, projection, tab-session, leases) and the names the barrel re-exported from shared api files to those shared api files; delete index.ts.
4. Add ./gateway ./projection ./tab-session ./leases to exports, add server to the workbench ADOPTERS entry, update boundaries.md, package-map.md and the voice-acceptance command.
5. Verify: tsc x2, lint, bun test packages/workbench, repository-policy, load.ts, cycles.ts, browser trace, bun run check.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
server/codex-workbench lives in packages/workbench/src/server in role folders behind four api files (41 names); the old module is gone. Codex reviewed 83ae20923 with no findings (1,475 bindings compared; test counts preserved). bun run check exited 0.
<!-- SECTION:FINAL_SUMMARY:END -->

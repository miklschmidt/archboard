---
id: TASK-500.09
title: Codex transport and session are in the codex-app-server package
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-19 03:14'
updated_date: '2026-10-19 03:54'
labels: []
dependencies:
  - TASK-500.08
parent_task_id: TASK-500
ordinal: 874000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The last runtime part of codex-app-server: runtime/codex-transport (request settlement, the stdio frames, write capacity) and runtime/codex-session (initialization, identity, failure contracts). codex-semantic-context also belongs to this package in the map but imports board schemas by value, so it moves with the board package, after it exists.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 codex-transport and codex-session live in packages/codex-app-server in runtime/ role folders with the exports that outside code needs, every importer uses them, and the error classes, identity brands and session symbols keep one definition each
- [ ] #2 The tests of the moved code live in packages/codex-app-server/tests, and the opt-in write-capacity test path names its new location
- [ ] #3 The package imports nothing from src/ and only lower packages
- [ ] #4 bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move runtime/codex-transport and runtime/codex-session (lib files, entry files, tests) into packages/codex-app-server under runtime/ role folders from their content (clients for the stdio transport, operations or services for session behavior, schemas/protocol for contracts). The entry files (index.ts, client.ts, server-requests.ts and the session index) are forwarding barrels: delete them and point importers at real files.
2. Keep the export surface small and deep (Codex advice). After this move make protocol-methods, request-schemas, response-schemas and thread-schemas private (their only outside users are session and transport). Fold what remains of client-request-schemas, authored-schemas, server-response-schemas and item-schemas that outside code still needs into a session contract file that owns validation and decoded results, without a forwarding barrel and without duplicating a schema definition. Replace the outside type-only core-schemas dependency with a named session input type, then make core-schemas private. Keep process, executable and protocol-version. protocol-decoder keeps an export only if a test outside the package still needs it; prefer moving those tests into the package.
3. One definition each for error classes, identity brands and session symbols. The package imports only lower packages and nothing from src/.
4. Tests move to packages/codex-app-server/tests/runtime/<role>/, shared support under tests/runtime/support/. The opt-in write-capacity test path in package.json (test:modules ignore, test:opt-in:capacity), ci.yml, evals/coverage.json, vite.config.ts and docs name the new locations.
5. Fix the two doc nits in docs/agents/boundaries.md: runtime exports are runtime-only by policy, not all Node-bound; state the real count that became private.
6. Browser safety trace with /tmp/pm/browser-trace.ts (0 node: imports; only shared files reachable). bun run check.
<!-- SECTION:PLAN:END -->

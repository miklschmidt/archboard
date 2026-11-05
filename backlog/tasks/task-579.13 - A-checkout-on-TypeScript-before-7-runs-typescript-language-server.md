---
id: TASK-579.13
title: A checkout on TypeScript before 7 runs typescript-language-server
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-05T15:40:00Z'
updated_date: '2026-11-05T16:02:00Z'
labels: []
dependencies: []
references:
  - >-
    packages/code-intel/src/runtime/operations/language-servers/server-command.ts
documentation:
  - >-
    docs/adr/0046-boards-carry-anchors-and-the-code-check-reads-them-on-request.md
parent_task_id: TASK-579
type: feature
ordinal: 1034000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TypeScript before 7 has no `tsc --lsp`. After TASK-579.12 such a checkout gets Archboard's own TypeScript 7 in a checkout of Archboard, which can disagree with the repository's compiler, and nothing in a release, which ships no TypeScript (ADR 0075). Many of these repositories, or the machines that work on them, already install typescript-language-server, the LSP wrapper around tsserver. Measured with typescript-language-server 5.1.3 and TypeScript 5.9.3: it answers only about an open file, and until its semantic server loads the project, its syntax server answers a definition with the import line instead of the declaration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Without a configured server, a checkout whose own TypeScript before 7 holds lib/tsserver.js runs typescript-language-server from its node_modules, else from the PATH of the Archboard server, with tsserver.path set to that TypeScript
- [ ] #2 Every TypeScript server gets the files it is asked about opened and is told not to answer from a syntax server, so typescript-language-server names the same declarations as tsc --lsp
- [ ] #3 The JSON answer and the text output name the program of each started server and, for a TypeScript the check chose, its version and whether it is the checkout's or Archboard's
- [ ] #4 A missing TypeScript server names the checkout's TypeScript version and how to get a server
- [ ] #5 A test runs a real typescript-language-server against a TypeScript 5.x fixture
- [ ] #6 ADR 0046 amendment, INSTALL.md and skills/archboard/references/setup.md describe the order
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. server-command: checkout TS<7 with lib/tsserver.js -> typescript-language-server (checkout node_modules/.bin, else PATH) with tsserver.path, useSyntaxServer never, ATA off.
2. TypeScript row opens files; configured TS servers get useSyntaxServer never.
3. Timings name program and chosen TypeScript; CLI line shows it.
4. Real test with typescript-language-server 6.0.3 on TypeScript 5.9.3 (devDependencies).
5. ADR 0046 amendment, INSTALL.md, setup.md.

Review f9265dc20..28d564381 along Standards and Spec axes. Fix verified findings in separate commits. Run focused language-server and isolated CLI tests, policy lint, and type checks after the fixes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: automatic, not configured. The checkout code that runs is its own TypeScript (TASK-433 #8 class); tsserver loads tsconfig plugins from node_modules (measured), which adds no power over tsserver.js itself. PATH lookup passes process.env PATH explicitly because Bun.which ignores a changed process.env.PATH otherwise. Measured: tls answers only open files and its syntax server names the import line; both owned by typescript-language-server.test.ts (mutation-checked). Pre-existing base failures: interface-width (skills 4>3, workspace 42>40, fails on base HEAD) and voice-package packed-README (Codex release strings). Follow-up: vault module 1aoB46lM (Language servers) description of the TypeScript choice is stale since TASK-579.12 and needs an owner proposal.

Review of f9265dc20..28d564381: fixed the native TypeScript initialization contract in 8ec558edb, missing or external tsserver.js recovery in b38c7a110, and test cleanup on failure in 0f755801e. The fixes enforce the documented server contract and add no architecture decision or new module boundary. The existing Language servers model follow-up remains separate. Initial focused tests, isolated CLI tests, policy lint, and type checks passed. Final validation follows the fixes.

Final review validation passed after all fixes: 21 focused language-server tests, including real TypeScript 5 and 7 servers; 14 isolated CLI tests; lint:policy with zero warnings and errors; type-check for source and browser; git diff --check. A temporary forced-failure probe confirmed that the real-server test awaits session closure after an assertion fails. Standards: one lifecycle finding fixed, no hard rule violations. Spec: two findings fixed. No remaining findings in the reviewed range. The known base failures were outside this focused validation. Task status and acceptance criteria remain unchanged for the owning agent.
<!-- SECTION:NOTES:END -->

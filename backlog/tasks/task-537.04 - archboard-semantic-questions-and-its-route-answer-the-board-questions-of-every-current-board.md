---
id: TASK-537.04
title: >-
  archboard semantic questions and its route answer the board questions of every
  current board
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T17:04:00Z'
updated_date: '2026-10-25T17:55:00Z'
labels:
  - design-questions
  - cli
dependencies:
  - TASK-537.01
parent_task_id: TASK-537
type: feature
ordinal: 931000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The CLI is the default surface (ADR 0008). An agent that runs the survey step of improve-codebase-architecture must get the same questions as the pane, from one derivation, over every current board of the vault.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard semantic questions answers the three board questions over every current board of the vault, with the boards, containers and parts behind each count
- [ ] #2 A repeatable --board option narrows the boards
- [ ] #3 The answer names the boards it read and the boards it skipped, with the reason
- [ ] #4 A route answers the same reading, requires a vault, and the CLI and the pane parse one schema derived by one function
- [ ] #5 The consumer skill teaches the command, and the evaluation inputs cover it
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Derivation (packages/board): designQuestions(content) in shared/rules/inspect/design-questions.ts, beside passThroughEntryPoints and over inspectContainer: pass-through entry points, containers with no hidden part, containers with no entry point, each as a container with its parts.
2. One answer, one schema (@archboard/board/design-questions): DesignQuestionsReplySchema (strict: counts and lists only) in shared/protocol/design-questions.ts, built by the one function designQuestionsReply. The route and the CLI parse it, and the pane imports the same export.
3. Reading (packages/board runtime, store-read): readDesignQuestions(vault, boards?) reads every board at its current variant, lists skipped boards with the reason (no-current-variant, board-unreadable) and reports names that match no board.
4. Route GET /api/vault/design-questions (apps/server): requireVault and vaultOfRequest, repeatable board query, BOARD_MISSING (404) for an unknown board. Listed in tests/system/server-state/vault-naming.test.ts.
5. CLI: archboard semantic questions [--board <name>]... (apps/cli, operations/semantic/questions). --board is a shared flag that routing strips, so routing now takes every --board and gives them back to a command that declares --board as its own option; a command on the shared board refuses a second one.
6. Consumer skill: references/read.md teaches the command; evals/ gains scenario S20 and a coverage row.
7. Tests: derivation, schema, runtime read, route, CLI command, routing of --board; the generic shared-option test in help.test.ts discovers locally declared spellings from the contracts.

Affected boards (proposals named TASK-537.04):
- Command interface@TASK-537.04: part Questions under Commands, called by Contract execution and calling Request transport.
- Archboard server routes@TASK-537.04: route part Design questions route under Reads and server health, reached by Agent CLI, calling Semantic board store and Vault requirement.
- Board persistence@TASK-537.04: function part Design questions under Board reading, called by Archboard server, calling List boards and Read and validate.
- Command dispatch@TASK-537.04: Global flag readers restated (every --board; a command that reads --board itself gets them back), its anchor now takeBoardFlags.
No other board is affected: Archboard server draws the routes only as Route handlers, and the pane (TASK-537.05) is not built here.
<!-- SECTION:PLAN:END -->

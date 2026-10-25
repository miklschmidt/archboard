---
id: TASK-537.04
title: >-
  archboard semantic questions and its route answer the board questions of every
  current board
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-25T17:04:00Z'
updated_date: '2026-10-25T18:26:00Z'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built as planned, with these decisions. (1) The route is GET /api/vault/design-questions (a vault-wide read, like /api/vault/check), repeatable board query; an unknown board is refused BOARD_MISSING (404), exit 2 in the CLI. (2) The answer is one strict schema, DesignQuestionsReplySchema (@archboard/board/design-questions), built by the one function designQuestionsReply; each question holds containers and parts counts plus results {board, container, parts}. Pass-through counts the entry points, the other two list each container with its children. (3) --board was a shared flag that routing stripped (first occurrence only) and refused on any command that did not declare it shared. Routing now takes every occurrence; a command that declares --board as its own option gets them back, a command on the shared board refuses a second. The generic shared-option test in help.test.ts now skips spellings a contract declares itself. This is why Command dispatch is an affected board: Global flag readers restated, anchor renamed takeBoardFlag to takeBoardFlags (the check flagged the old anchor as ANCHOR_SYMBOL_MISSING, which the proposal clears). (4) Branch rebased onto a463ff7e9 of feat/architecture-insight-ux at the coordinator's request.
Code check: the findings of archboard check --code against the same run with --variant TASK-537.04 differ by one line, a finding that the proposal clears (the old takeBoardFlag anchor). No finding is introduced, and none names a file of this task.
Footprint, base a463ff7e9 (the commit before the first Refs: TASK-537.04 code commit), read against each proposal parent (TASK-515, TASK-509, TASK-511, TASK-480 after TASK-482.07). Command interface: namedAndChanged Questions; changedNotNamed Command catalogue (run.ts gains one entry in the table, and the board already draws a contract per command) and Commands (a directory that holds the new Questions); namedNotChanged Contract execution and Request transport (named only by relationships). Archboard server routes: Design questions route changed; Vault requirement named only by a relationship. Board persistence: Design questions changed; List boards and Read and validate named only by relationships. Command dispatch: Global flag readers changed; changedNotNamed runCliWith (session.ts: boardsAsOptions gives the flags back, an inside change, and its relationship to the flag readers is restated). Boards behind after these commits and not proposed: Archboard server and Live panes (application.ts mounts one more route; HTTP application still composes the middleware and mounts every route), Archboard (packages/board and skills gain files; no package, layer or wiring changes), Skill evaluation (Evaluation inputs gain scenario S20). Each stays true.
Gate: bun run check fails only in the first module lane on Board viewer (track) in wide-boards.test.ts (TASK-542). test:system 257 pass, test:repository 142 pass, test:serial-browser exit 0. Lint and type-check pass. Stale copies: run archboard install-skill to refresh the skill in ~/.agents/skills, since references/read.md and SKILL.md changed.
<!-- SECTION:NOTES:END -->

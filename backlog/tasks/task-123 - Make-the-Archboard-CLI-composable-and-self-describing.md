---
id: TASK-123
title: Replace the Archboard CLI with schema-defined command contracts
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-25 23:52'
updated_date: '2026-08-26 06:47'
labels: []
dependencies:
  - TASK-124
references:
  - src/cli/run.ts
  - src/cli/util.ts
  - src/cli/commands
  - src/core/canvas-client.ts
  - skills/archboard/SKILL.md
  - skills/archboard/references/cheatsheet.md
  - tasks/task-093
  - tasks/task-094
  - tasks/task-119
  - tasks/task-120
  - tasks/task-121
  - tasks/task-122
priority: high
type: feature
ordinal: 125000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the hand-written CLI dispatcher, raw string-array handlers, scattered argument parsing, and anonymous JSON printing with one schema-driven command system. Each public command and subcommand must be declared once as an Archboard-owned CommandContract containing its Zod input schema, Zod result schema, help and examples, prerequisites, read or write effects, refusal and exit behavior, and handler. Commander is a replaceable parsing shell behind a small local adapter; Archboard does not expose or organize its interface around Commander or zod-commander types.

The same contracts must drive runtime parsing, typed handler results, output validation, generated CLI help, public-surface coverage, documented REST relationships, and the complete command-to-result reference used by agents. This is the foundation for composable operations: a caller can inspect a stable result, select fields with jq, pass them to the next command, and know which command can safely consume them.

The rewrite also includes a source-backed workflow audit. Where a requested act currently requires redundant queries, caller-side geometry or identity reconstruction, temporary patches, or multiple commands that Archboard could safely replace with one deeper operation, capture focused follow-up work. Preserve separate commands when they represent separate user intent, approval, claim, optimistic-concurrency boundary, or write.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every public CLI command and subcommand is declared through one Archboard-owned CommandContract containing Zod schemas for parsed input and returned output, command metadata, prerequisites, effects, refusals and exits, examples, and its typed handler.
- [ ] #2 Commander is isolated behind a small local Zod adapter; command modules do not parse raw argv arrays or depend on Commander or zod-commander types.
- [ ] #3 Successful structured output is validated against the declared result schema before JSON reaches stdout; diagnostics stay on stderr, and intentional text, raw-content, and file-output modes are explicit contract variants.
- [ ] #4 Generated help, public CLI surface inventory, skill result reference, and documented CLI-to-REST relationships derive from command contracts and fail when a command, result field, prerequisite, exit behavior, or claimed shared contract drifts.
- [ ] #5 The existing CLI is migrated without changing established public spellings or semantics except where a separately approved collapse task defines a deeper interface and compatibility behavior.
- [ ] #6 A source-backed workflow audit applies the deletion test to real agent command chains, records approved and rejected collapses, and creates focused follow-up tasks for deeper commands without weakening one-write, claim, or optimistic-concurrency invariants.
- [ ] #7 TASK-119 through TASK-121 declare their new commands and results through the schema system, and TASK-122 teaches only generated, released command contracts with tested jq examples.
- [ ] #8 Automated tests cover input validation, cross-field constraints, output-schema rejection, clean stdout and stderr separation, exit mapping, generated help and reference coverage, intentional REST asymmetries, Bun execution, and representative read, write, browser-dependent, and file-output commands.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Complete TASK-123.01 as an approved four-command proof of the CommandContract module.
2. Complete TASK-123.02 by migrating the remaining CLI commands and deleting the legacy parser, dispatch, and handler-owned output path only after the final migration.
3. Complete TASK-119, TASK-120, and TASK-121 against the released contract interface.
4. Complete TASK-123.03 after TASK-123.02 and TASK-119 through TASK-121, generating the full result and chaining reference.
5. Run independent Standards and Spec review for each subtask, preserve green fix/check/full-suite gates, and finalize TASK-123 only after all three subtasks meet their acceptance criteria.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-26 00:01
---
TASK-124 is now a prerequisite. The schema rewrite targets the surviving CLI and documented REST relationships only; MCP parity is removed.
---

created: 2026-08-26 01:26
---
TASK-124 reconciliation: CommandContract generates and validates the surviving CLI contract plus intentional REST application asymmetries only.
---
<!-- COMMENTS:END -->

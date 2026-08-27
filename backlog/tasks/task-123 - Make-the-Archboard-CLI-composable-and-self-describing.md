---
id: TASK-123
title: Replace the Archboard CLI with schema-defined command contracts
status: Done
assignee:
  - '@codex'
created_date: '2026-08-25 23:52'
updated_date: '2026-08-27 16:07'
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
Replace the hand-written CLI dispatcher, raw string-array handlers, scattered argument parsing, and anonymous JSON printing with one schema-driven command system. Each public command and subcommand is declared once as an Archboard-owned CommandContract containing its Zod input schema, Zod result schema, help and examples, prerequisites, read or write effects, refusal and exit behavior, and handler. Commander remains a replaceable parsing shell behind a small local adapter; Archboard does not expose or organize its interface around Commander or zod-commander types.

The same contracts drive runtime parsing, typed handler results, output validation, generated CLI help, public-surface coverage, documented REST relationships, and the authoritative on-demand contract proof. Agent guidance points to those source Zod schemas and inferred types, and adds only a compact tested workflow guide; it does not maintain copied result shapes or field tables.

The rewrite also includes a source-backed workflow audit. Where a requested act currently requires redundant queries, caller-side geometry or identity reconstruction, temporary patches, or multiple commands that Archboard could safely replace with one deeper operation, capture focused follow-up work. Preserve separate commands when they represent separate user intent, approval, claim, optimistic-concurrency boundary, or write.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every public CLI command and subcommand is declared through one Archboard-owned CommandContract containing Zod schemas for parsed input and returned output, command metadata, prerequisites, effects, refusals and exits, examples, and its typed handler.
- [x] #2 Commander is isolated behind a small local Zod adapter; command modules do not parse raw argv arrays or depend on Commander or zod-commander types.
- [x] #3 Successful structured output is validated against the declared result schema before JSON reaches stdout; diagnostics stay on stderr, and intentional text, raw-content, and file-output modes are explicit contract variants.
- [x] #4 Generated help, public CLI surface inventory, the authoritative on-demand contract proof, tested workflow-guide coverage, and documented CLI-to-REST relationships derive from CommandContracts and fail when a command, prerequisite, exit behavior, or claimed shared contract drifts. The skill references source Zod schemas/inferred types and the derived proof without copying result shapes or field tables.
- [x] #5 The existing CLI is migrated without changing established public spellings or semantics except where a separately approved collapse task defines a deeper interface and compatibility behavior.
- [x] #6 A source-backed workflow audit applies the deletion test to real agent command chains, records approved and rejected collapses, and creates focused follow-up tasks for deeper commands without weakening one-write, claim, or optimistic-concurrency invariants.
- [x] #7 TASK-119 through TASK-121 declare their new commands and results through the schema system, and TASK-122 teaches released contracts through the tested workflow guide and authoritative type pointers rather than speculative flags, output fields, or copied schema documentation.
- [x] #8 Automated tests cover input validation, cross-field constraints, output-schema rejection, clean stdout and stderr separation, exit mapping, generated help and contract-proof coverage, workflow jq examples, intentional REST asymmetries, Bun execution, and representative read, write, browser-dependent, and file-output commands.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Complete TASK-123.01 as an approved four-command proof of the CommandContract module.

2. Complete TASK-123.02 by migrating the remaining CLI commands and deleting the legacy parser, dispatch, and handler-owned output path only after the final migration.

3. Complete TASK-119, TASK-120, and TASK-121 against the released contract interface.

4. Complete TASK-123.03 after TASK-123.02 and TASK-119 through TASK-121, adding authoritative type/proof navigation plus a compact tested workflow guide and jq chains without copying result schemas or field tables.

5. Run independent Standards and Spec review for each subtask, preserve green fix/check/full-suite gates, and finalize TASK-123 only after all three subtasks meet their acceptance criteria.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parent finalization (2026-08-27): TASK-123.01, TASK-123.02, TASK-123.03, and TASK-122 are Done with all acceptance criteria checked after independent fixed-range review. TASK-119 through TASK-121 are released through the current CommandContract registry. The final skill keeps source Zod schemas/inferred types authoritative and contains no copied result catalogue.
<!-- SECTION:NOTES:END -->

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

author: @codex
created: 2026-08-27 14:15
---
Parent wording reconciled with TASK-123.03: source CommandContract Zod schemas and inferred types are authoritative; the skill gets navigation and tested workflows, not a copied result reference.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed the schema-defined CLI program across TASK-123.01/.02/.03 and the released TASK-119 through TASK-122 integrations. Every current public path is a CommandContract with Zod input/result authority, typed handlers, staged validation, explicit prerequisites/effects/refusals/output modes, and Commander confined to the private adapter. The 36-command/25-subcommand/61-path registry drives help, CLI audit, REST reconciliation, and the ignored on-demand contract proof while preserving the immutable ordered 57-path compatibility subset. Agent guidance points to source ResultSchemas/inferred types and a compact ten-chain jq workflow guide rather than copied result tables; TASK-122 now teaches the released completion composition without speculative fields. Workflow deletion testing produced focused TASK-126 and TASK-127 follow-ups while preserving one-write, claim, and version boundaries. Verification spans each subtask's clean independent Standards/Spec reviews, 61 proofs/61 audited paths/1011 contract checks, 93 workflow checks, 630 CLI checks, installed-skill byte identity, stable fix passes, complete check and separate full test chains, serial headless browser lanes, and clean generated-artifact ownership.
<!-- SECTION:FINAL_SUMMARY:END -->

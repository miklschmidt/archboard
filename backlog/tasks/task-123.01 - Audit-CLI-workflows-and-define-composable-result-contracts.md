---
id: TASK-123.01
title: Design and prove the schema-driven CLI contract
status: To Do
assignee: []
created_date: '2026-08-25 23:53'
updated_date: '2026-08-26 00:01'
labels: []
dependencies:
  - TASK-124
references:
  - src/cli/run.ts
  - src/cli/util.ts
  - src/cli/commands
  - src/core/canvas-client.ts
  - src/core/library-catalogue.ts
  - src/core/element-ops.ts
  - skills/archboard/SKILL.md
  - skills/archboard/references/cheatsheet.md
  - tasks/task-093
  - tasks/task-094
  - tasks/task-119
  - tasks/task-120
  - tasks/task-121
parent_task_id: TASK-123
priority: high
type: task
ordinal: 126000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Inventory the current CLI as an interface used by agents and scripts, then design and prove the CommandContract boundary that will replace it. The contract owns Zod input and result schemas, user-facing metadata, prerequisites, read or write effects, refusal and exit mappings, output mode, examples, and a typed handler. A small Archboard-owned adapter translates only the parsing metadata into Commander. Command modules and public types remain independent of Commander and zod-commander.

The proof must cover structurally different commands: a pure structured read, an element write with board fingerprint and optimistic concurrency, a browser-dependent command, and a non-JSON or file-producing command. It must show cross-field input validation, result validation before stdout, clean diagnostics on stderr, generated help, machine-readable contract introspection, and a generated reference fragment. Evaluate zod-commander as prior art and record why it is not the public boundary: its current action contract returns void and does not model result schemas, prerequisites, effects, or refusals.

In parallel, trace real workflows from tests, task history, and architecture-board work. Start with the device-trust stencil sequence, then inspect promotion, grouping, duplication, querying, arranging, versions, claims, rendering, and TASK-119 through TASK-121. Apply the deletion test and create focused follow-up tasks for approved command collapses. Do not migrate the whole CLI in this task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A checked-in audit enumerates every public command and subcommand with current parsing owner, stdout mode, result shape or type owner, diagnostics, exits, prerequisites, board and write semantics, ordering guarantees, and fields needed by likely next commands.
- [ ] #2 A checked-in design defines CommandContract and its Zod input and output schemas, command metadata, prerequisites, effects, refusals and exit mappings, output modes, examples, typed handler, composition rules, and compatibility policy.
- [ ] #3 The local adapter is the only module coupled to Commander; its supported argument and option semantics include aliases, booleans, repeatable values, defaults, coercion, enums, optional and required values, stdin and file inputs, pass-through content where intentional, and cross-field validation.
- [ ] #4 Representative proof commands cover a structured read, a versioned element write, a browser-dependent operation, and an intentional text, raw-content, or file-output operation without changing their established public behavior.
- [ ] #5 The proof validates successful results before stdout, keeps diagnostics on stderr, maps declared refusals to exits, exposes machine-readable contract metadata, and generates help plus a result-reference fragment from the same source.
- [ ] #6 The dependency evaluation records zod-commander compatibility and its missing result, prerequisite, effect, and refusal contracts, and confirms the Archboard contract does not expose that package or Commander types.
- [ ] #7 The workflow audit classifies real command chains as necessary composition, missing return data, missing handle, duplicated query, caller-side work Archboard already knows, or candidate single act; approved collapses become focused child or linked tasks and rejected collapses retain their reasons.
- [ ] #8 The design preserves public CLI spellings, one requested act per write, claims, board-version refusal, browser and server boundaries, and explicitly documented CLI-to-REST relationships without recreating a second agent command surface.
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-26 00:01
---
Sequenced after TASK-124 so the audit and proof cover only the surviving CLI, REST, and canvas boundaries.
---
<!-- COMMENTS:END -->

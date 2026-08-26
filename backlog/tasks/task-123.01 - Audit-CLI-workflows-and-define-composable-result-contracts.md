---
id: TASK-123.01
title: Design and prove the schema-driven CLI contract
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-25 23:53'
updated_date: '2026-08-26 07:36'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Freeze the reviewed base, dirty-file ownership, 33-command and 24-subcommand surface, and 271-check CLI baseline. Before dependency changes, smoke-test an exact Commander 15.0.0 install under the repository Bun for import, parseAsync, output/exit capture, required-value greediness, aliases, repeats, and help suppression. Stop before package or lock changes if the smoke fails.
2. Add canonical docs/design/cli-command-audit.json for every public command and subcommand, including current parsing, public result, diagnostics, exits/refusals, ordered prerequisites/effects, board/write/version/claim semantics, REST/local/browser relationships, ordering, and downstream fields. Generate the Markdown view and fail on drift. Apply the deletion test to real workflows; record follow-up candidates without implementing them.
3. Add the deep src/cli/command-contract module. Its Archboard-owned interface declares CommandContract, runCommand, and introspection. Private implementation owns token adaptation, staged Zod execution, ordered prerequisites, result validation, held presentation, artifact validation/writes, help, diagnostics, and exit mapping.
4. Keep semantic ownership single. Parameter descriptors declare token grammar only: spellings, aliases, token arity, occurrences, positionals, stdin/file routing, and intentional pass-through. Zod alone owns types, coercion, defaults, enums, optionality, and cross-field rules. Construction checks only grammar coherence and ingress-key mapping.
5. Keep public result schemas separate from output execution. CommandContract.result describes the command-specific public value/content. OutputPolicy selects JSON, text, raw, or file-receipt behavior. A non-introspected execution record may carry a public result plus a pending artifact. Validate the held-adjusted public result and pending artifact independently before any file write or stdout.
6. Use real internal seams only: Commander plus a non-parsing recording ArgvParser fake; process/filesystem plus recording CommandHost; production server/browser plus ordered fake PrerequisiteResolver. Commander types remain confined to the private adapter.
7. Keep src/cli/commands/run.ts as the sole registry and mixed contract/legacy router. Preserve the pre-import --url bootstrap and existing help/version handling. TASK-123.02 owns deletion of the legacy branch, raw parser helpers, and handler-owned output after the last migration.
8. Prove exactly query, update, viewport, and export. Preserve their spellings, result shapes, REST cardinality, one-write/version behavior, browser requirement, raw/file behavior, held behavior, and refusal precedence. Protect runtime persistence, lock, version, client, server, UI, shared invariant, and skill modules.
9. Add an independent legacy-binary argv golden exercised through the real Commander adapter. Pin globals and duplication, equals forms, option-looking values, bare --, excess positionals, repeat semantics, stdin and literal dash behavior, help/version oddities, aliases, exact exits 0 through 5, stdout/stderr bytes, and held placement.
10. Encode and test exact phases. Query keeps server-before-bbox and read-before-filter validation. Update keeps local JSON/file/stdin validation before server and performs one PUT. Viewport keeps mode rules before server/browser and numeric refusal after them. Export keeps format/frontmatter/overwrite refusal before server; raw bypasses held presentation; file validates receipt and artifact before UTF-8 write.
11. Generate proof metadata, help, and reference fragments from the one registry and public contracts. Introspection exposes public schemas, modes, prerequisites, effects, refusals/exits, examples, and REST relationships, never private execution or adapter data. Do not add a public introspection command or edit the Archboard skill in this subtask.
12. For audit collapse candidates, obtain parent approval, read task-creation instructions, search duplicates, create focused linked or child tasks through Backlog, and record IDs. Do not implement collapses, TASK-123.02, or TASK-119 here.
13. Commit in focused checkpoints for audit/design, the command-contract module and compatibility golden, and the four proof migrations plus generated artifacts. Stage explicit files and preserve parent-owned work.
14. Run the command-contract and CLI suites, generation freshness, import boundaries, one-write/doing/version/boards/browser checks, two stable fix passes, bun run check, and the complete sequential test chain. Use independent Standards and Spec review over fixed base 43d0b982ac39346ae3057edf3c9fdffe400b2853 and remediate until both are clean.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Checkpoint ac2b34b records the canonical 57-path CLI audit, generated Markdown view, approved command-contract design, Commander 15.0.0 Bun smoke evidence, and zod-commander evaluation. Workflow deletion-test candidates were sent to the parent for approval; no follow-up tasks were created.

Follow-up disposition recorded: created standalone To Do tasks TASK-126 (replace import as one atomic board write) and TASK-127 (snapshot restore as one atomic board write). The device-trust stencil/insert/promote/group/arrange collapse was rejected because those operations can encode separate human intent and current evidence is one workflow, not repeated released use; reconsider only after TASK-119 through TASK-122 provide production-backed completion/evaluation evidence. Neither follow-up was started or given an implementation plan.

Proof implementation checkpoint 1a0438d: introduced the CommandContract deep module, adopted Commander 15.0.0 only behind the private adapter after the Bun smoke, and migrated exactly query/update/viewport/export through run.ts. Removed their duplicate legacy handlers. Focused validation passed: type-check, 7 contract tests plus artifact freshness/ownership checks, and the real CLI surface/argv suite with 338 checks.

Review and validation checkpoint: independent Standards and Spec rereviews both pass over fixed base 43d0b982ac39346ae3057edf3c9fdffe400b2853 after fixes in 3bd180c, fba77f7, and 92171c2. The fixed-base golden now distinguishes exits 0-5, globals, aliases, equals/option-looking/dash/excess arguments, repeatable append and nonrepeatable last-wins, exact stream ownership, and all held modes; test:cli passes 401 checks. Two consecutive bun run fix passes were stable. bun run check passed the complete chain, and a separate sequential bun run test passed. The human-performance browser gate transiently reported [0,0,2] reconciliation in earlier full invocations, passed immediately in isolation, then passed in both the green check and final green test; no source change was made for the transient. TASK-123.01 remains In Progress with acceptance criteria untouched for parent review.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-26 00:01
---
Sequenced after TASK-124 so the audit and proof cover only the surviving CLI, REST, and canvas boundaries.
---

author: @codex
created: 2026-08-26 06:47
---
Plan approved after independent high-stakes review. Approval requires the isolated Commander 15.0.0 Bun smoke to pass before package.json or bun.lock changes.
---
<!-- COMMENTS:END -->

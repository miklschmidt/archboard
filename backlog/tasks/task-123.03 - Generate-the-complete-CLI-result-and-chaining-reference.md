---
id: TASK-123.03
title: Generate the complete CLI result and chaining reference
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-25 23:58'
updated_date: '2026-08-27 15:11'
labels: []
dependencies:
  - TASK-123.02
  - TASK-119
  - TASK-120
  - TASK-121
references:
  - skills/archboard/SKILL.md
  - skills/archboard/references/cheatsheet.md
  - scripts/sync-skills.mjs
  - tasks/task-119
  - tasks/task-120
  - tasks/task-121
  - tasks/task-122
  - tasks/task-123.02
parent_task_id: TASK-123
priority: high
type: docs
ordinal: 128000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a compact agent-facing workflow guide to the tracked Archboard skill source. CommandContract result Zod schemas and their inferred types remain the sole authority for result shapes, refinements, streams, effects, refusals, exits, and REST relationships. The guide points agents to those source contracts and to the existing ignored on-demand command-contract proof, then documents only useful released producer-to-consumer mappings and tested jq extractions.

No result-schema manual, per-command field table, fourth generated contract artifact, help-output change, or duplicated ordering catalogue is added. SKILL.md and the cheatsheet carry one discoverable pointer each; the existing recursive skill sync/install owners copy the tracked guide unchanged. TASK-122 remains responsible for broader completion and visual-evidence teaching.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CommandContract result Zod schemas and inferred types remain the sole result-shape authority. TASK-123.03 adds no schema manual and no new generated contract artifact; the existing on-demand command-contract-proof.json is linked only as a derived searchable projection whose source Zod contract wins.
- [ ] #2 A compact tracked cli-workflows.md documents only useful released producer-to-consumer mappings and jq extractions for read/query, writes and board version, stencil insertion, promotion, grouping, inspection, bridge creation/removal, focused rendering, and file artifacts where a real chain exists. User choices and independent reinspection are labeled rather than presented as data pipes.
- [ ] #3 Every documented jq program is executed by a focused check against data first validated by the exact producing ResultSchema or produced by a shipped pure owner and then parsed. Every named producer and consumer resolves to cliContractRegistry; the guide is not required to mention every public command.
- [ ] #4 SKILL.md and cheatsheet.md contain one discoverable pointer to the workflow guide and no copied result schemas, result-field tables, or per-command shape descriptions. Generic sync and install paths copy the tracked reference byte-for-byte, and command help remains byte-compatible.
- [ ] #5 The guide uses only released TASK-119 through TASK-121 contracts: schema-v2 check, bridge, bridge remove, and render-findings. TASK-122 remains the sole owner of the completion gate and broader inspection, bridge, and rendering teaching.
- [ ] #6 Existing 61-path contract proof coverage, immutable fixed-57 compatibility, CLI-to-REST reconciliation, generated ownership, runtime schemas, registry paths, streams/exits, and server/UI behavior remain unchanged. The only contract metadata correction is check's stale Schema-v1 output description to Schema-v2.
- [ ] #7 Focused validation proves workflow markers resolve to live contracts, jq examples produce expected bytes from schema-valid data, tracked/synchronized/installed guide copies match, existing generated artifact names remain unchanged, and no generated view is committed.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add skills/archboard/references/cli-workflows.md with a short navigation route to command help, source CommandContract Zod schemas/inferred types, and the existing ignored command-contract-proof.json projection. Include only natural producer-to-consumer mappings and marked jq examples; keep field names only where a consumer uses them.

2. Add one pointer from skills/archboard/SKILL.md and one from skills/archboard/references/cheatsheet.md. Do not rewrite completion teaching or command tables; TASK-122 owns that work.

3. Correct src/cli/commands/check.ts output metadata from Schema-v1 to Schema-v2 without changing its schema, handler, streams, help bytes, or package behavior.

4. Add scripts/check-command-workflows.mjs and run it from test:contracts. Validate marked fixtures through the exact producer ResultSchema or shipped pure owner, execute the real jq binary, compare exact output, and require named producer/consumer paths in cliContractRegistry. Add an install/sync byte-identity assertion for the tracked guide; do not change sync-skills.

5. Preserve the three existing generated artifact names, the 61-path registry, immutable fixed-57 records, and ignored generated ownership. Do not add a public introspection command, new CommandContract metadata, workflow DSL, all-command matrix, schema descriptions, result fields, or browser scenario.

6. Run the focused workflow check, lint:skills, test:contracts, test:install, test:cli, type-check, sync byte comparison, two stable fix passes, complete bun run check, separate bun run test, and independent fixed-range Standards and Spec reviews from 2c45d71ece3a31ccbb432da0b265f693bbd9fa81.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation checkpoint (2026-08-27):
- ed97235 adds the tracked thin CLI workflow guide, one SKILL.md pointer, one cheatsheet pointer, and the sole Schema-v2 metadata correction. Source CommandContract ResultSchemas/inferred types remain authoritative; no result tables or generated artifact were added.
- bfdc87d adds the marked-example checker, real jq execution against schema-valid/pure-owner fixtures, strict 6/7/8 stdout capture evidence, registry resolution, sync byte identity, and install byte identity.
- Focused gates green: workflow 84 checks, skill lint, contracts 61 proofs/1011 checks, install 112 checks, CLI 36 commands/25 subcommands/630 checks, lint, type-check, and git diff --check.
- Generated ownership remains three ignored on-demand views; registry remains 61 paths and the immutable 57-path subset is unchanged.

Final implementation validation (2026-08-27):
- Two consecutive bun run fix passes were byte-stable with a clean committed tree after each.
- Complete bun run check passed, followed by a separate complete bun run test; all four browser suites ran sequentially/headless in each chain.
- On-demand contract generation succeeded twice into owned temporary directories and all three artifact byte streams matched; ignored checkout views were removed afterward.
- Final git diff --check is clean. TASK-123.03 remains In Progress with all seven acceptance criteria unchecked for independent fixed-range review.

Review remediation checkpoint (2026-08-27):
- 24149ba replaces the unexecuted inline join invocation with a marked [.elements[].id] | join(",") example that reuses the existing schema-valid add fixture and pins raw stdout as node-a,node-b plus newline.
- The displayed Bash chain now consumes the captured value without containing another jq program.
- The focused checker removes every marked jq block and rejects any remaining jq invocation in the guide. Workflow coverage is now 93 checks.
- Focused lint:skills, contracts, install, CLI, type-check, and git diff --check are green.

Review remediation final validation (2026-08-27):
- bun run fix passed twice with byte-stable, clean output.
- Complete bun run check passed, followed by a separate complete bun run test; all four browser lanes ran sequentially and headless. The first complete-check attempt hit an isolated human-performance reconciliation flake and the next hit an isolated staleness port collision; each owner passed in isolation, then the required complete chain passed.
- On-demand contract generation ran twice in owned temporary directories; cli-command-audit.md, command-contract-proof.json, and command-contract-proof.md were byte-identical between runs. No generated view exists in the checkout.
- Final git diff --check is clean. TASK-123.03 remains In Progress with all seven acceptance criteria unchecked.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-27 08:08
---
Parent contract decision (2026-08-27): CommandContract Zod schemas and inferred result types are the sole authority. TASK-123.03 must not copy result-field tables into SKILL.md, cheatsheet, or a second hand-maintained reference. The skill should reference the authoritative types/generated contract view. Any generated agent reference is limited to a thin navigational/workflow index and tested examples derived mechanically from the contracts; it must not become another schema copy requiring synchronization.
---

author: @codex
created: 2026-08-27 14:01
---
Parent orchestration started after TASK-121 shipped. Plan from current CommandContract registry and tracked skill source. The authoritative Zod schemas and inferred types remain the sole result-shape source; generated or hand-written skill material may provide navigation and executable chains, but must not copy result schemas or field tables.
---

author: @codex
created: 2026-08-27 14:14
---
Parent approved the xhigh deletion-test amendment: one thin workflow guide, two skill pointers, schema-valid jq examples, no copied result shapes, no fourth generated artifact, and source Zod contracts as the sole authority.
---
<!-- COMMENTS:END -->

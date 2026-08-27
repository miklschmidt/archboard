---
id: TASK-123.03
title: Generate the complete CLI result and chaining reference
status: To Do
assignee: []
created_date: '2026-08-25 23:58'
updated_date: '2026-08-27 08:08'
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
Generate the agent-facing CLI reference from the released CommandContract registry and integrate it into the tracked Archboard skill source. The reference must account for every command and subcommand, not merely list syntax. It explains each input and result schema, stdout mode, field meanings, stable ordering, prerequisites, effects, refusals, exits, and the next commands that can consume important fields.

Add tested jq examples for common chains and compact extraction patterns, including board fingerprints and optimistic writes, created and affected element IDs, stencil instance handles and bounds when released, query selection, promotion, grouping and arrangement, inspection findings, bridge decoration results, and focused-render artifacts. Generated material has one source of truth in CommandContract; hand-written guidance may explain workflows but must not restate schema tables that can drift.

Update skill synchronization and validation so a released command or changed contract cannot leave installed agent documentation stale.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A generated reference maps every public command and subcommand to its input schema, result schema or intentional non-JSON output mode, field meanings, prerequisites, effects, refusals, exit statuses, and stable-order guarantees.
- [ ] #2 The reference identifies useful producer-to-consumer field mappings and contains tested jq examples for representative read, write, query, stencil, grouping, promotion, board-version, inspection, bridge, rendering, and file-artifact workflows that exist when the task is implemented.
- [ ] #3 Generated schema material comes directly from CommandContract metadata; the skill adds human workflow guidance without maintaining a second hand-written copy of result shapes.
- [ ] #4 The tracked skill source, derived skill installations, cheatsheet, and command help link consistently to the generated reference using the repository skill-sync process.
- [ ] #5 TASK-119 through TASK-121 result contracts are included once released, and TASK-122 teaches the generated reference and efficient chains instead of speculative flags or output fields.
- [ ] #6 Automated checks fail when any public command lacks reference coverage, generated reference content is stale, an example jq program does not work against fixture output, or a documented CLI-to-REST contract relationship drifts.
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-27 08:08
---
Parent contract decision (2026-08-27): CommandContract Zod schemas and inferred result types are the sole authority. TASK-123.03 must not copy result-field tables into SKILL.md, cheatsheet, or a second hand-maintained reference. The skill should reference the authoritative types/generated contract view. Any generated agent reference is limited to a thin navigational/workflow index and tested examples derived mechanically from the contracts; it must not become another schema copy requiring synchronization.
---
<!-- COMMENTS:END -->

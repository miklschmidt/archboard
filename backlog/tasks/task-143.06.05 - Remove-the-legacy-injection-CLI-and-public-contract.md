---
id: TASK-143.06.05
title: Remove the legacy injection CLI and public contract
status: To Do
assignee: []
created_date: '2026-08-30 16:29'
labels: []
dependencies:
  - TASK-143.06.04
modified_files:
  - src/cli/commands/inject.ts
  - src/cli/commands/run.ts
  - src/runtime/engine/canvas-client.ts
  - src/cli/command-contract
  - tests/system/cli/fixtures/fixed-base-compatibility.json
parent_task_id: TASK-143.06
priority: high
type: task
ordinal: 250000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Remove the inject command/help/schemas/client calls and fixed compatibility entries after the server surface is gone. This task owns the public CLI seam only. Delegation profile: gpt-5.6-sol, medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard help/dispatch no longer exposes inject status/test or ARCHBOARD_INJECT guidance, and the canvas client exports no injection DTO/request.
- [ ] #2 CLI schemas and generated/fixed command contracts remove only the retired command and preserve stable ordering/behavior for all remaining commands.
- [ ] #3 Calling the old command follows the ordinary unknown-command path with migration text pointing to the linked workbench, not a compatibility transport.
- [ ] #4 CLI contract generation and fixed-base tests pass without an injection fixture, hidden alias, dead schema, or second HTTP route.
<!-- AC:END -->

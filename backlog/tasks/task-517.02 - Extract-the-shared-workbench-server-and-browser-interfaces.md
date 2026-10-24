---
id: TASK-517.02
title: Extract the shared workbench server and browser interfaces
status: To Do
assignee:
  - '@codex'
created_date: '2026-10-24 11:38'
updated_date: '2026-10-24 11:40'
labels: []
dependencies:
  - TASK-517.01
parent_task_id: TASK-517
priority: high
type: task
ordinal: 927000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A second application needs a small public entry that owns the agent machinery and media lifecycle. The existing exports expose internal composition and Archboard transport requirements.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One reusable workspace package exposes public server and browser interfaces without importing Archboard domain modules.
- [ ] #2 Archboard uses the shared implementation and retains its visual shell and domain integration.
- [ ] #3 Moved implementations and tests have one owner, and package direction and browser safety remain enforced.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
This delivery contributes package and browser separation to the parent proposals: Archboard@TASK-517; Agent workbench@TASK-517; Voice coordinator@TASK-517; Codex workhorse@TASK-517; Codex session@TASK-517; Browser application@TASK-517; Archboard server@TASK-517.
1. Move reusable runtime, server composition, shared contracts, and their tests into packages/agent-workbench.
2. Expose one server factory that owns startup, shutdown, sessions, browser connections, conversation activation, and snapshots.
3. Move browser media and output metering into the same package behind a browser-safe entry.
4. Keep the Archboard shell, board projections, domain context, narration, pane services, and application wiring in packages/workbench.
5. Update callers through explicit package exports. Delete moved implementations and avoid compatibility or duplicate execution paths.
6. Update package layers and documentation without weakening dependency direction, browser safety, lint, or type rules.
7. Run the relevant behavior and package-contract owners, simplify the interface, and commit with Refs: TASK-517.02.
The parent owns board adoption, the complete gate, review, and final acceptance evidence.
<!-- SECTION:PLAN:END -->

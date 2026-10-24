---
id: TASK-517.02
title: Extract the shared workbench server and browser interfaces
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-24 11:38'
updated_date: '2026-10-24 12:54'
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

Implementation split: the backend implementer owns reusable runtime and server code, the mixed generation/session contracts, and Archboard backend wiring. The parent owns all shared browser contracts, media clients, UI callers, package manifests, dependency policies, and ownership docs. The exact source map is /tmp/task517.01-host-separation-handoff.json. Shared realtime contracts move once to the new canonical owner.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parent moved 18 shared implementation files, 14 browser media and output files, and 23 test or support files into agent-workbench. The integration now imports those declarations through public entries. The core voice presentation payload is JSON; Archboard retains its strict walkthrough and recording schema. All 666 isolated UI and shared cases passed. Browser types and scoped UI/shared lint passed. The new package sits at layer 6, with an explicit foundation dependency contract. The final integration pass will remove public exports without an outside caller after backend imports converge.
<!-- SECTION:NOTES:END -->

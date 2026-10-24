---
id: TASK-517.01
title: Separate host policy from Codex workbench mechanics
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-24 11:38'
updated_date: '2026-10-24 11:42'
labels: []
dependencies: []
parent_task_id: TASK-517
priority: high
type: task
ordinal: 926000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The current workbench requires Archboard context and instructions throughout its runtime. Both applications need the same agent authority and lifecycle behavior with their own domain policy.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Role instructions, context events, domain tools, and checkout access enter through explicit host contracts.
- [ ] #2 Reusable mechanics preserve exact generation checks, unknown delivery outcomes, approval ownership, and coordinator retirement.
- [ ] #3 Archboard supplies board context, catalogues, narration, and domain instructions through its integration.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
This delivery contributes host separation to the parent proposals: Archboard@TASK-517; Agent workbench@TASK-517; Voice coordinator@TASK-517; Codex workhorse@TASK-517; Codex session@TASK-517; Browser application@TASK-517; Archboard server@TASK-517.
1. Split reusable execution authority from Archboard board meaning without weakening identity or freshness comparisons.
2. Compose core role instructions with immutable host instructions. Hash the exact composed instructions and manifests.
3. Inject host context sources, domain tools, and checkout admission. Keep board catalogues, pane news, and narration in Archboard.
4. Remove mandatory Archboard environment variables from the Codex process contract. Preserve its environment allowlist and protected storage roots.
5. Move board-specific semantic publishing out of the Codex SDK and into the Archboard integration.
6. Preserve the current public Archboard behavior through the new policy inputs and run focused backend owners.
7. Inspect the implementation for a smaller interface and commit the changes with Refs: TASK-517.01.
The parent owns board adoption, the complete gate, review, and final acceptance evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parent changed package exports so the Archboard semantic publisher belongs to workbench. The SDK no longer exposes semantic-context. The host-separation implementer owns the matching source and test relocation. Canonical realtime contracts stay in workbench until TASK-517.02.
<!-- SECTION:NOTES:END -->

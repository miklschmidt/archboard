---
id: TASK-549.13
title: Explain the captured reading through local agent actions
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T22:16:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.06
  - TASK-549.12
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 943000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 13.

## What to build

Agent explanations must describe the reading that the user selected when the request began.

Toolbar, context-menu, keyboard, and voice actions explain selections, relationships, flows, and proposals through the same local workhorse contract.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.06, TASK-549.12
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Toolbar, context-menu, keyboard, and voice actions explain selections, relationships, flows, and proposals through the same local workhorse contract.
- [ ] #2 Each request captures its model, revision, identities, reading, and action at invocation. Later navigation never retargets it.
- [ ] #3 The interface and voice use one textual answer. Unavailable agents, progress, failure, and retry remain visible. Missing-flow requests can trigger investigation.
- [ ] #4 Answers remain temporary until an explicit agent edit records them through normal claims and stale-write protection.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm signed integration 212ef722 and publish the external action contract. Read .07 and .15 contracts without importing their source.
2. Create TASK-549.13 drafts for Board persistence, Codex workhorse, Voice coordinator, and Command interface as affected. Parent owns Browser application.
3. Use TDD through public architecture reads with real files and Git to capture exact state, complete revision, stable subjects, reading intent, and proposal comparison.
4. Route UI, CLI, typed, and voice invocations through one temporary local explanation action over the existing workhorse queue and text notifications. Preserve captured input for retry and cancellation.
5. Update consumer guidance, ADRs, test ownership, and evaluation coverage without live evaluation. Simplify, run focused behavior and adapter tests, both type projects, lint, formatting, and affected proposal checks.
6. Merge latest integration, leave task In Progress and proposals draft for parent browser acceptance, release claims, stop this server, sign commits, and save external backend handoff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Signed base verified in clean supplied worktree feat/task-549-cli-backend. Material value: architects receive an answer about the exact selected reading after navigation changes, through one existing local workhorse.
<!-- SECTION:NOTES:END -->

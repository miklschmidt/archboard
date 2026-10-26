---
id: TASK-549.13
title: Explain the captured reading through local agent actions
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T22:48:00Z'
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

Keep workbench within its existing interface ceiling by moving shown-conversation request assembly behind its existing public showConversation operation. Remove three routing-only public helpers. Preserve the HTTP contract and all browser behavior.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Signed base verified in clean supplied worktree feat/task-549-cli-backend. Material value: architects receive an answer about the exact selected reading after navigation changes, through one existing local workhorse.

Public width gate exposed three added workbench names. The implementation will replace the apps/server assembly of workbench internals with the existing showConversation operation. Board width remains the pre-existing 245/188 debt assigned to .24.

Backend and CLI implementation is complete for parent acceptance. The shared public architecture reader captures exact model, state or checkpoint, complete revision, stable subjects, reading intent, and the actual comparison base with its separate revision. One local action serves HTTP, CLI, typed requests, and voice through existing workhorse queues and notifications. Canonical pane reports expose the actual reading and tab identity without legacy inference. Concurrent action identity, queued cancellation, exact turn interruption, unavailable sign-in, empty answers, and captured retries have controlled-provider evidence. Answers remain temporary.
Simplification moved conversation-selection assembly behind the existing workbench operation and made three routing helpers private. Workbench remains at its 138-name ceiling. The existing retained-comparison test now owns checkpoint explanation capture, which removes a duplicate Git fixture. Board width stays at the known 245/188 debt for .24.
Validation: 24 public model tests pass; 5 pane/action/activation tests pass; 88 transport and package/skill contract tests pass; 52 guidance and CLI help tests pass; final action/instruction subset passes 43 tests. Both TypeScript projects, lint with zero warnings, formatting, and evaluation input validation pass. No live model evaluation ran. Draft code checks have zero warnings on the seven affected boards. Nine unrelated warnings remain on Archboard and Archboard server.
All TASK-549.13 proposals remain draft: Board persistence, Archboard server routes, Codex workhorse, Voice coordinator, Command interface, Live panes, and Codex realtime voice. Parent owns Browser application, all frontend controls, canonical pane report emission, browser interaction and voice acceptance, and adoption. Task remains In Progress. External contract: /home/msc/.local/state/archboard-implementation/task-549/task-549.13-contract.md.
<!-- SECTION:NOTES:END -->

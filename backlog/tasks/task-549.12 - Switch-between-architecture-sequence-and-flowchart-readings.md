---
id: TASK-549.12
title: Switch between architecture, sequence, and flowchart readings
status: In Progress
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T18:51:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.05
  - TASK-549.11
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 942000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 12.

## What to build

Readers need structural and behavioral explanations without inferring execution order from dependencies.

A reader changes diagram grammar and chooses an applicable flow. Multiple matches require a choice, and missing flows remain explicit.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.05, TASK-549.11
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A reader changes diagram grammar and chooses an applicable flow. Multiple matches require a choice, and missing flows remain explicit.
- [ ] #2 Behavioral readings include all required participants and steps, including those outside the prior scope. Structural filters do not remove flow messages.
- [ ] #3 Returning to architecture restores the prior reading. No selection of structural relationships invents execution order.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep grammar and explicit flow selection in the existing per-pane router address. Preserve architecture scope, focus, and filters when switching modes.
2. Reuse the complete canonical read and existing browser renderer. Offer flows that touch current selected subjects or scope, including descendants and relationship endpoints. Always require an explicit flow choice and preserve unavailable identities.
3. Draw the complete selected flow with every required participant and step. Structural relationship and group filters remain architecture presentation and do not remove behavioral content.
4. Add visible mode and flow controls, accessible selection and details, and explicit empty, missing, loading, failure, and recovery states. Keep selection and camera independent of rendering.
5. Use short TDD slices through the approved browser seam with real files and the public runtime. Cover relevant-flow choice, both behavioral grammars, all participants, architecture restoration, history, and unavailable flows.
6. Maintain Browser application@TASK-549.12 and any further affected proposals. Update ADR0060, consumer guidance, frontend contracts, coverage, and test ownership. The common agent investigation contract remains TASK-549.13.
7. Run focused browser regressions, types, lint, formatting, architecture checks, and existing contract owners as needed. Inspect the rendered workflow and simplify ownership.
8. Merge latest integration, adopt accurate proposals, release claims, stop the server, close proven criteria, and provide a signed source to the required merger.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parent frontend work starts in isolated checkout /home/msc/Projects/archboard.feat-module-diagram-modes from integrated5432fed897cd0b7bcbb8ada2c41dabd533305cca. Dependencies .05 and .11 are Done and integrated. Parent owns all frontend. The approved browser and public runtime seams remain unchanged. No model evaluation, dependency installation request, or scope expansion is required.

Browser application@TASK-549.12 is draft at version172. The proposal describes per-pane grammar/flow addresses, complete behavioral projections, relevant explicit flow choices, and preservation of architecture scope/focus/filters. The existing renderer already supports all three grammars, so no renderer architecture or API addition is planned. Worktree server12686 is ready at PID1128291. Dependencies install successfully.
<!-- SECTION:NOTES:END -->

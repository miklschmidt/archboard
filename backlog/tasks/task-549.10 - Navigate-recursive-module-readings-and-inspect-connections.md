---
id: TASK-549.10
title: Navigate recursive module readings and inspect connections
status: In Progress
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T14:56:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.01
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 940000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 10.

## What to build

Readers need recursive exploration without authored boards or fixed levels for each scope.

A reader opens root modules, drills into immediate children, and returns through breadcrumbs or browser Back and Forward.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.01
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A reader opens root modules, drills into immediate children, and returns through breadcrumbs or browser Back and Forward.
- [ ] #2 Show direct callers and outgoing targets as nearby context. Derive interfaces before filters, and retain whole-module endpoints without inventing internal targets.
- [ ] #3 Project and aggregate connections by visible endpoints and kind. Inspection reveals every underlying relationship and distinct label in deterministic order.
- [ ] #4 Reuse client rendering. Reject obsolete layout results by reading and revision. Camera changes remain immediate, and missing subjects produce explicit partial readings.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reuse the existing semantic scene renderer, camera, hit testing, and complete-state container inspection. Keep scope projection and relationship aggregation together without constructing a board document.

2. Add model reading parameters to the existing router. Deliberate scope and checkpoint changes create history; Back and Forward restore the same identities. Keep camera and transient selection separate.

3. Derive roots or immediate children, scoped-interface endpoints, and direct nearby context from the complete canonical model. Aggregate projected relationships by direction and kind with stable underlying identities and labels.

4. Add the diagram, breadcrumbs, opening controls, aggregate inspection, and explicit missing-subject states to the existing model reader. Keep closed internals closed and preserve valid camera position.

5. Use TDD through the existing browser adapter for navigation and inspection. Prove obsolete layout results cannot replace the selected reading and revision, without duplicating renderer algorithm tests.

6. Update task-named architecture proposals, applicable decisions, consumer guidance and examples. Run focused checks, simplify, commit with signing, merge the integration tip, and hand the complete branch to a merger.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Affected architecture proposals: Browser application@TASK-549.10 and Semantic renderer@TASK-549.10. The existing camera, atlas, and layout engine retain their contracts. The approved browser seam owns visible navigation and connection inspection.

Checkpoint: root modules now render through the existing browser renderer and camera. The focused browser regression failed before implementation and passes afterward with 12 assertions. Source and browser types pass. Recursive scope navigation, nearby context, connection inspection, and complete freshness coverage remain in progress. Both architecture proposals remain drafts.

Integrated durable reads through signed merge 88578767e. The first recursive browser case failed on the absent opening action after correcting a duplicate fixture identity. It now passes root-to-module-to-child navigation, containment breadcrumbs, Back/Forward, reload, and unchanged input revisions, with four assertions. A router reducer type mismatch was identified and corrected through the existing search validator. The slice remains incomplete: exact-checkpoint URL state, mixed pane address ownership, model identity guards, connection inspection, complete interface presentation, geometry reuse, and obsolete-layout behavior still need delivery.
<!-- SECTION:NOTES:END -->

---
id: TASK-549.10
title: Navigate recursive module readings and inspect connections
status: Done
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T17:05:00Z'
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
- [x] #1 A reader opens root modules, drills into immediate children, and returns through breadcrumbs or browser Back and Forward.
- [x] #2 Show direct callers and outgoing targets as nearby context. Derive interfaces before filters, and retain whole-module endpoints without inventing internal targets.
- [x] #3 Project and aggregate connections by visible endpoints and kind. Inspection reveals every underlying relationship and distinct label in deterministic order.
- [x] #4 Reuse client rendering. Reject obsolete layout results by reading and revision. Camera changes remain immediate, and missing subjects produce explicit partial readings.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused tests pass at the agreed public runtime or browser seam.
- [x] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reuse the existing semantic scene renderer, camera, hit testing, and complete-state container inspection. Keep scope projection and relationship aggregation together without constructing a board document.

2. Add model reading parameters to the existing router. Deliberate scope and checkpoint changes create history; Back and Forward restore the same identities. Keep camera and transient selection separate.

3. Derive roots or immediate children, scoped-interface endpoints, and direct nearby context from the complete canonical model. Aggregate projected relationships by direction and kind with stable underlying identities and labels.

4. Add the diagram, breadcrumbs, opening controls, aggregate inspection, and explicit missing-subject states to the existing model reader. Keep closed internals closed and preserve valid camera position.

5. Use TDD through the existing browser adapter for navigation and inspection. Prove obsolete layout results cannot replace the selected reading and revision, without duplicating renderer algorithm tests.

6. Update task-named architecture proposals, applicable decisions, consumer guidance and examples. Run focused checks, simplify, commit with signing, merge the integration tip, and hand the complete branch to a merger.

7. Complete canonical URL ownership within the existing workspace router. Preserve requested model, scope, and checkpoint for each actual pane, including unavailable readings. Let the model reader consume that address directly. Keep legacy board opens on their existing server-confirmed path. Prove multi-pane reload and exact history through the existing browser owner.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Affected architecture proposals: Browser application@TASK-549.10 and Semantic renderer@TASK-549.10. The existing camera, atlas, and layout engine retain their contracts. The approved browser seam owns visible navigation and connection inspection.

Checkpoint: root modules now render through the existing browser renderer and camera. The focused browser regression failed before implementation and passes afterward with 12 assertions. Source and browser types pass. Recursive scope navigation, nearby context, connection inspection, and complete freshness coverage remain in progress. Both architecture proposals remain drafts.

Integrated durable reads through signed merge 88578767e. The first recursive browser case failed on the absent opening action after correcting a duplicate fixture identity. It now passes root-to-module-to-child navigation, containment breadcrumbs, Back/Forward, reload, and unchanged input revisions, with four assertions. A router reducer type mismatch was identified and corrected through the existing search validator. The slice remains incomplete: exact-checkpoint URL state, mixed pane address ownership, model identity guards, connection inspection, complete interface presentation, geometry reuse, and obsolete-layout behavior still need delivery.

The corrected recursive slice passes source and frontend types. Focused production lint passes after six initial findings were fixed without changing rules. The DOM installation now keeps its SVG in refs and updates selection without replacing unchanged SVG. The browser navigation owner passes again after that change. This is a partial checkpoint, not completion of TASK-549.10.

The integrated source includes structural editing and publication through signed c9f7b03ec. Canonical addresses now restore independent panes, exact checkpoints, scopes, pane closure, Back, and reload. Unknown model and scope identities stay explicit. Projected connections separate direction and kind and expose every underlying identity and label. Complete interface facts reuse the existing container inspector. A real hidden-description edit exposed scene replacement; renderer-prepared semantic keys now preserve the mounted scene across that revision. Three navigation cases pass, plus the existing scope owner. Types and lint pass before final visual corrections. The publication regression exposed a test race: completion polling could observe the initially enabled button before the action started. The test now observes aria-busy before waiting for completion, without a product timeout or implementation change. Final closure validation and architecture adoption remain pending.

Final browser evidence passes 13 distinct cases and 83 assertions across navigation, publication, current/historical viewing, structural updates, and workspace addresses. Shared scope regression passes 16 cases and 25 assertions. Final source/frontend types and full lint pass with no warnings. Evaluation inputs pass 21 scenarios, 21 fixtures, and 14 coverage parts. The parent inspected root connection details and the corrected open-module interface at 1920 by 1080. Temporary screenshot calls and diagnostics are removed. The first code check identified one missing browser-host to view-dispatcher relationship; the task proposal now includes the evidenced call. Final architecture checks and adoption remain pending.

The renderer width gate exposed two added names at 63/61. Its callers now derive draw parameters and results from the existing operations. Removing the redundant public BoardRenderChoices, BoardRenderOutcome, and RenderedDiagram types reduces the result to 60 names, so the renderer ceiling falls from 61 to 60. The board ceiling remains unchanged at 188. No operation is hidden behind a namespace and no lint or type rule changes.

Latest integration35b630ed4 is included through signed f63560aa5. Both parent histories and all shared views are preserved. Combined types, metadata validation, and formatting pass. Both integration proposals are adopted and current semantics has zero diagnostics. Affected code checks have no warnings; ten existing warnings remain elsewhere. Renderer width passes at60/60. Only board243/188 remains under TASK-549.24. Browser and renderer interfaces retain one content cache, one router, the existing camera, and the existing layout engine.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Readers explore recursive scopes, inspect complete directed connections and interfaces, and restore exact readings independently in each pane. Missing model, scope, or history stays explicit. Scene reuse preserves the mounted diagram when hidden evidence changes. Thirteen browser cases and83assertions pass, with16shared scope cases and81API/consumer contract cases. Types, lint, metadata, formatting, current semantics, and affected architecture checks pass. The renderer interface shrinks to60names. The known board width remains243/188 until TASK-549.24.
<!-- SECTION:FINAL_SUMMARY:END -->

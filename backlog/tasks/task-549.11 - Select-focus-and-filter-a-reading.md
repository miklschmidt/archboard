---
id: TASK-549.11
title: Select, focus, and filter a reading
status: Done
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T18:44:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.10
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 941000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 11.

## What to build

Readers need to isolate a question directly from the elements on screen.

A reader selects by dragging, toggles subjects with Ctrl/Cmd-click, and focuses the result. Keyboard users receive equivalent actions.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.10
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A reader selects by dragging, toggles subjects with Ctrl/Cmd-click, and focuses the result. Keyboard users receive equivalent actions.
- [x] #2 Space-drag and middle-button drag pan. Escape clears selection. Selection and highlighting never wait for layout or flood browser history.
- [x] #3 Focus preserves mixed ancestor and descendant selections. It expands only the required paths and retains necessary endpoint context.
- [x] #4 Visible controls filter relationship kinds and groups. Hidden selections retain an inspector count and reveal action. These actions change no architecture files.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused tests pass at the agreed public runtime or browser seam.
- [x] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep transient subject selection separate from router-owned scope, focus, and filter state. Reuse the canonical reader, renderer key, atlas, and camera.
2. Add normal selection, Ctrl/Cmd toggling, keyboard equivalents, and an immediate drag rectangle. Resolve aggregate lines to their authored relationship identities. Space-drag and middle-button drag retain panning, and Escape clears selection.
3. Add a visible Focus action. Project selected subjects and only required ancestor paths, preserving mixed ancestor/descendant selection and required endpoint context. No model writes or authored boards.
4. Add visible relationship-kind and group-region controls. Group visibility controls drawn regions while canonical memberships remain intact. Hidden or missing selected identities stay inspectable, with counts and an explicit reveal action.
5. Use short TDD slices at the approved browser seam with real model files. Prove keyboard/pointer parity, immediate feedback without scene replacement, stable history, focus, filtering, and unchanged authored revisions.
6. Maintain Browser application@TASK-549.11 and any further affected architecture proposals. Update consumer guidance, ADRs, frontend contracts, and evaluation coverage.
7. Run focused browser/runtime regressions as needed, source/frontend types, lint, formatting, and architecture checks. Simplify the result and use signed checkpoints.
8. Merge latest integration, adopt accurate proposals after validation, release claims, stop the server, close only proven criteria, and provide the required merger handoff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parent frontend work starts in its own Worktrunk checkout /home/msc/Projects/archboard.feat-module-selection-focus on feat/module-selection-focus at integration62853e30f78aa52473ed1ef69d9481920e166b2b. Dependencies install successfully and resolve within this checkout. TASK-549.10 is Done and integrated. TASK-549.05 runs separately on gpt-6.1-sol xhigh. The approved browser and public runtime seams remain unchanged. Group visibility follows the owner discussion about toggling rendered features: it hides group regions, not canonical membership or an implicit descendant set.

First selection slice is implemented and remains partial. The browser owner passed1case/5assertions for pointer modifiers, Ctrl/Cmd+Enter, Escape, unchanged scene identity, unchanged history, and unchanged model revision. Selection now survives scope navigation; the existing navigation owner passes3cases/19assertions. Source/frontend types and corrected lint pass. The inspector has a dedicated component and keeps the open scope interface visible. Deferred ModelDiagram loading removes the ineffective dynamic import warning without changing renderer interfaces. Its browser owner and types pass; final focused lint exits0. Existing large index/layout-worker chunks remain outside this loading-boundary repair. Drag selection, focus projection, filters, hidden/reveal behavior, final docs, and architecture adoption remain unfinished.

The gesture slice passes its red-to-green browser owner. Primary dragging from empty canvas draws an immediate rectangle and selects intersecting canonical subjects through renderer-owned bounds. Middle-button and Space dragging pan without changing selection, history, or scene identity. The selection row keeps viewport height stable. Keyboard handlers remain separate from legacy pointer handlers, preserving the existing keyboard owner. Combined gesture, selection, and legacy exploration owners pass3cases/65assertions. Source/frontend types and full lint pass with zero findings. Focus, filters, hidden/reveal behavior, final docs, and adoption remain pending.

Focus now captures selected canonical identities in the router address, preserves mixed ancestors and descendants, and opens only required containment paths with direct endpoint context. Collapsed private self-relationships do not invent visible self-loops. Back, Forward, and reload restore focus without changing model revisions. The focused browser owner passes one case and six assertions. Source/frontend types and full lint pass with zero findings. Filters, hidden/reveal behavior, final documentation, and adoption remain pending.

The filter and Focus browser owners pass two cases and fourteen assertions, including partial/all-missing focus, relationship/group visibility, hidden selection details, Reveal, Back, reload, and unchanged revisions. Filters reuse the existing dropdown checkbox owner and its keyboard dismissal. Source/frontend types and evaluation metadata pass. Documentation and coverage now describe the delivered selection workflow. Browser application@TASK-549.11 is updated at version169. Final integrated regressions, visual inspection, proposal adoption, and closure remain.

Final integrated evidence: nine distinct browser cases and108assertions pass. Owners cover selection1/5, gestures1/6, focus1/9, filters1/6, navigation3/19, structure1/9, and legacy exploration1/54. Both extra boundary REDs are fixed: Space works before canvas focus, and explicit self-connection focus stays visible. The filter owner now observes menu opening and dismissal before actions; two serial runs pass without product timing changes. Source/frontend types, full lint, formatting,16scope cases/25assertions,81API/consumer cases, and evaluation metadata pass. Parent inspected the focused UI, filters, and architecture render. Browser application@TASK-549.11 is adopted as dfw8YWLy at version170. The affected code check has zero warnings; ten unrelated warnings remain elsewhere. All29prior variants, views, and decision records remain intact. The simplification pass keeps one router authority, one transient selection owner, the existing camera and atlas, one projection boundary, and the shared menu checkbox. Renderer width stays60; known board245/188 remains TASK-549.24. No full-gate success, push, or PR readiness is claimed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Readers can select modules and relationships by pointer, drag, or keyboard, then focus the exact identities with required containment and endpoint context. Filters keep complete architectural meaning and hidden selections, with an explicit reveal action. Selection stays independent of layout and browser history; focus and filters restore through the existing router. Browser and public contract evidence passes. Architecture, consumer guidance, ADRs, and coverage match delivery. The complete TASK-549 specification and its final review remain open.
<!-- SECTION:FINAL_SUMMARY:END -->

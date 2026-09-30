---
id: TASK-140.04
title: Inspect the selected element and its code binding in the shell
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 02:30'
updated_date: '2026-08-30 09:14'
labels: []
dependencies:
  - TASK-140.01
references:
  - docs/design/operator-canvas-shell.md
parent_task_id: TASK-140
priority: high
type: feature
ordinal: 160000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add the reference right-side inspector for the focused pane selection. A person should be able to confirm what an element represents, whether it is bound to code, and the portable code address before opening it. The inspector reads existing scene and binding data and reuses the current code-target activation contract; it does not add health metrics or persist machine-local paths.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 With exactly one selected element, the inspector shows its stable identity and available Archboard node, kind, name, variant, and level metadata without exposing unknown custom data
- [x] #2 For a code-bound element, the inspector shows repository identity, repository-relative path, and present branch, commit, and confirmed-at values from customData.archboard.binding
- [x] #3 The inspector opens bound code through the existing board-and-element code target, and existing settings and GitHub recovery actions remain accurate when local activation is unavailable
- [x] #4 No selection, multiple selection, an unbound element, a malformed binding, and a selection that disappears each produce a clear reachable state without stale details
- [x] #5 Selection inspection and derived activation targets remain presentation-only, write no note data, and never persist a machine-local checkout path
- [x] #6 Focused unit and rendered browser coverage proves bound, unbound, malformed, empty, multiple, open-success, and open-recovery behavior in both themes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a pure selected-element projection that accepts the focused pane scene plus selected IDs, whitelists only stable id/type and Archboard node/kind/name/variant/level fields, parses bindings with the shared strict CodeBindingSchema, and returns explicit empty, multiple, missing, unbound, malformed, or bound states; cover it with focused unit tests.
2. Extend CanvasPane with a presentation-only selection snapshot callback sourced from existing Excalidraw selectedElementIds and the imperative scene, then let Shell retain snapshots per pane and clear stale data on board, pane, or scene changes without adding a server endpoint or write path.
3. Add a narrow right-side SelectionInspector beside the pane region, with a compact 420 pixel disclosure that keeps the canvas primary; show only whitelisted metadata and portable repo-relative binding fields in both themes.
4. Route the inspector Open code action through the same board-and-element activation helper used by canvas links, preserving the existing notice, Opener settings, and validated GitHub recovery actions while never displaying or persisting a machine-local checkout path.
5. Add focused module and canonical rendered browser coverage for empty, multiple, disappeared, unbound, malformed, bound, focus-pane transfer, success, recovery, both themes, and zero note/change-feed writes; validate layout/fullscreen/claim regressions, inventory, lint, format, both TypeScript projects, production build, and inspected desktop plus 420 pixel renders.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a strict presentation-only selection projection, a responsive right-side inspector, and shared code-target activation with existing notice/settings/GitHub recovery. The projection exposes only stable identity, whitelisted Archboard metadata, and portable binding fields; malformed or machine-local paths remain unavailable. Added canonical rendered coverage and updated the 18-owner inventory/documentation. Validation: projection and activation modules 24 pass/66 assertions; repository policy 81 pass/164 assertions; affected canonical browser lane 6 owners/340 assertions; format, lint, both TypeScript projects, production build, and diff check passed. Inspected desktop light/dark bound and empty states plus 420px light/dark collapsed/disclosed renders under the current visualization workspace. Protected CI workflow is unchanged from a8275ac.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a responsive selected-element inspector that safely projects real Archboard metadata and portable code bindings, reuses existing activation and recovery, and performs no board writes. Verified bound, unbound, malformed, empty, multiple, disappeared, success, recovery, two themes, desktop, 420px, fullscreen, claim, and adjacent activation behavior with focused module, repository-policy, canonical browser, static, type, and production-build checks.
<!-- SECTION:FINAL_SUMMARY:END -->

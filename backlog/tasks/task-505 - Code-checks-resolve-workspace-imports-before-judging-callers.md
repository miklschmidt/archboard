---
id: TASK-505
title: Code checks resolve workspace imports before judging callers
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-22 03:24'
updated_date: '2026-10-22 03:42'
labels: []
dependencies: []
references:
  - >-
    packages/code-intel/src/runtime/operations/code-facts/modules/module-resolution.ts
  - TASK-501
priority: high
type: bug
ordinal: 912000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-501 board repairs exposed false EXPOSED_UNUSED information after TASK-500 moved source to workspace packages. The static TypeScript module resolver reads relative imports and tsconfig paths, but not manifest imports or workspace package exports. A direct probe cannot resolve #ui/clients/pane-session/pane-report-sender.ts from pane-core.ts even though apps/web/package.json declares #* and pane-core imports and calls createPaneReportSender. The code check then says that all 41 pane-session names have no outside caller. More containers now make this existing resolver gap visible. This undermines interface and dependency findings. TASK-501 keeps singular bindings and repairs board ownership separately.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The code check resolves owner-local # imports and declared workspace package exports from the checkout metadata that it reads
- [ ] #2 A real caller through either workspace import form prevents false EXPOSED_UNUSED and contributes the correct code evidence
- [ ] #3 Resolution stays inside the selected checkout and revision, including historical Git readings, and leaves external packages unresolved
- [ ] #4 Focused regressions cover the observed pane-session caller and a cross-package public entry without weakening existing checks
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Restore static TypeScript import resolution through manifest-local imports and workspace package exports. Keep the existing checkout-file reader so historical Git trees and checkout containment stay authoritative. Add focused regressions for real callers through both forms, then run the normal gate together with the required renderer repairs. This corrects the internal analyzer, so no product architecture board changes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User explicitly requested the resolver defect fixed ASAP on 2026-10-22. Reproduction: #ui/clients/pane-session/pane-report-sender.ts resolves to undefined from pane-core.ts despite its package imports declaration. The real importing file calls createPaneReportSender, while code check reports it unused.

Commit 6964cd0fa resolves manifest-local imports and declared workspace exports from CheckoutFiles and supplied text reads. All 39 focused tests pass, including pane-session callers, public package calls, containment, and cached source bytes across historical manifest changes. Targeted lint and formatting pass. The first live code pass clears the false Board move unused-export finding and exposes 30 missing-relationship identities. Source-backed board corrections reconcile architectural calls, while notes explain pure helper and data-node dependencies outside each board question. Browser visual ownership now binds components, with a child for voice box presence, instead of treating all workbench UI roles as one visual owner. Complete gate remains pending.
<!-- SECTION:NOTES:END -->

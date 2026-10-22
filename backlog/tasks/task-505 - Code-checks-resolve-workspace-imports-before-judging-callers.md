---
id: TASK-505
title: Code checks resolve workspace imports before judging callers
status: To Do
assignee: []
created_date: '2026-10-22 03:24'
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

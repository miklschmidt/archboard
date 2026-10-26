---
id: TASK-529.03
title: The ui-kit package interface is a few components
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
updated_date: '2026-10-25T05:44:00Z'
labels: []
dependencies: []
parent_task_id: TASK-529
type: task
ordinal: 944000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of TASK-529 for the ui-kit package(s). TASK-500 kept every name callers imported, so callers assemble internals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The callers use only the package's narrowed public entries, and the package's focused tests, type-check and lint pass
- [x] #2 Each public entry exposes operations a caller needs, measured by the names and facts it must learn
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ui-kit went from 10 subpaths with 85 names to 4 subpaths with 37 names. Each shadcn family is one composite with its parts on its root (Dialog.Content, Select.Item, Tooltip.Provider, Resizable.Panel), and every component comes from ./components. The registry files moved unchanged into ui/components/shadcn/. Dialog.Cancel replaced CANCEL_BUTTON_CLASS; Dialog.Busy, Dialog.Error and Field.Issues replaced ./dialog-parts; ./stepped-clock joined ./frame-clock; the pane chrome moved to apps/web, its one owner. DOM unchanged. Checks: type-check, lint, focused UI tests (979 pass) and repository-policy (149 pass).

Review (review/ui-kit, merged): the Select composite wrote its parts onto Base UI's own Select.Root export; fixed with a package-owned SelectRoot and a test that fails on the old code (28958a7bc). Dialog.Close had no caller and was removed (72a1d2d5d).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ui-kit exposes four subpaths: ./components (composites such as Dialog, Field, Select, Tabs, Tooltip, Resizable, built with Object.assign), ./frame-clock, ./time and ./fullscreen-presentation. The shadcn files are private under src/ui/components/shadcn/, Select uses a package-owned SelectRoot instead of mutating Base UI's export, and the pane chrome moved to apps/web. Width 85 -> 37 (ceiling 37). Verified by type-check, lint, the web and ui-kit tests and the browser lane.
<!-- SECTION:FINAL_SUMMARY:END -->

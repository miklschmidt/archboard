---
id: TASK-590.11
title: Measures opens as a dialog drawn from the site's Measures table
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T15:07:00Z'
updated_date: '2026-11-07T16:21:00Z'
labels: []
dependencies: []
parent_task_id: TASK-590
ordinal: 1054000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-11-07 the owner said that even the 448 px column is too narrow for Measures, and that Measures must become a dialog that draws heavily on the Measures demo of the marketing site (site/src/components/demos/Measures.astro).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Measures opens in a dialog as one table with a row per module and a column per count, sortable from the column heads
- [x] #2 Everything the Measures tab does today is reachable in the dialog, including selecting a module on its picture
- [x] #3 The dialog is a shadcn dialog of the ui-kit and is checked by screenshots in both themes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ModelMeasuresDialog (ui-kit Dialog) holds its own tab and the sort of each table. Its head is the site's content selector: a new selector variant of the ui-kit Tabs, three large tabs of icon, label and gloss.
2. Tab 2 (What a module exposes) and tab 3 (What changes together) draw ModelMeasures as the site's Measures table: one row per module, one column per count of that tab, sorted from the column heads (aria-sort, a second press turns the order round), the sorted cell with a gold bar sized to its value. The Show filter, the meaning of the sorted measure, the not-read dashes, the blanks, the history status with Refresh and the count of modules on show stay.
3. A row selects its module on its picture through findModule, from the pointer and from Enter, and Alt opens it beside, as a Measures row does today. One tab stop walks the rows with the arrows.
4. Temporary trigger in ModelReading.tsx in place of the Measures tab, committed alone.
5. Tests: the component test of ModelMeasures moves to the table, a dialog test proves that a tab shows its view, and tests/system/browser/reader-measures.test.ts drives the dialog.
6. DESIGN.md Measures and selector parts, .impeccable/design.json. Screenshots at 1920x1080 in both themes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-11-07, branch feat/measures-findings-dialog:
- ModelMeasuresDialog is a ui-kit Dialog. The site's content selector, a new selector variant of the ui-kit Tabs, stands at its head with three views. By the owner's choice of 2026-11-07, the counts stand in two tables: What a module exposes and What changes together. Each table has a row for each module and a column for each count, and its column heads sort it.
- A row closes the dialog and then selects its module, as Find does, so the focus lands on the picture. Alt opens the module beside.
- The history reads when the What changes together view opens. ADR 0045 says that Measures asks when it opens. The read stays on request, but the ADR wording names the dialog.
- The key in ModelReading.tsx is temporary and sits alone in its commit. The column's own key must carry data-slot="model-measures-open", or openMeasures in tests/system/browser/reader-measures.test.ts must change.
- Verification: bun test --parallel on model-measures.test.tsx and model-code-evidence.test.tsx passed 17 tests. bun run fix and bun run lint exited 0. tsc of both projects exited 0. The browser lane with --focus tests/system/browser/reader-measures.test.ts exited 0. Screenshots at 1920x1080 in both themes show the selector, both tables, a lit row and the sorted column.
<!-- SECTION:NOTES:END -->

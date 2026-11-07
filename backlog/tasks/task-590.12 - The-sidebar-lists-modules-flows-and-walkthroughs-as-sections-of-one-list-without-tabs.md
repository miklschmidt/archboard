---
id: TASK-590.12
title: >-
  The sidebar lists modules, flows and walkthroughs as sections of one list,
  without tabs
status: To Do
assignee:
  - '@claude'
created_date: '2026-11-07T15:08:00Z'
labels: []
dependencies:
  - TASK-590.10
  - TASK-590.11
parent_task_id: TASK-590
ordinal: 1055000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-11-07 the owner said they hate the sidebar tabs, and that the 448 px column is far too wide while still too narrow for History and Measures. Modules, flows and walkthroughs belong in one list in separate sections, and the column goes back to a normal width. NAVIGATOR_WIDTH also sets the reference pane of the renderer (ADR 0043 and its amendment of 2026-10-31), so the width change reaches the core constants.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The left column has no tabs: modules, flows and walkthroughs are sections of one list
- [ ] #2 While a proposal is read, its changes are reachable without a tab
- [ ] #3 History and Measures open their dialogs from the column
- [ ] #4 The column has a normal width, and NAVIGATOR_WIDTH, the core constants and ADR 0043 follow it
<!-- AC:END -->

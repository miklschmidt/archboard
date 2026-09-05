---
id: TASK-150.04
title: Build the fresh canvas shell and navigation
status: To Do
assignee:
  - '@codex'
created_date: '2026-09-05 00:08'
updated_date: '2026-09-05 01:23'
labels: []
dependencies:
  - TASK-150.02
references:
  - TASK-150
  - docs/design/assets/operator-sidebar-reference.png
parent_task_id: TASK-150
priority: high
type: task
ordinal: 294000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The legacy shell scatters canvas navigation, status and controls across custom markup and CSS, slowing changes and obscuring the primary canvas workflow. Rebuild it with the shared shadcn and Tailwind foundation while preserving every product capability. Astra owns composition decisions. All grunt UI work and verification must run in visible gpt-6-astra tasks with low reasoning. Do not start an independent reviewer loop until every TASK-150 implementation child reports complete.

The application shell is desktop-only, with 1920×1080 as its explicit design and rendered-acceptance target. Mobile/phone layouts, mobile navigation, mobile breakpoints and mobile test gates are out of scope. Do not introduce them during this rework.

Smaller desktop windows retain the same composition: the canvas flexes and overflowing content scrolls where needed. Keep existing panel collapse controls usable. Do not add alternate compact/mobile layouts or require a fixed 1920×1080 minimum window. 1920×1080 remains the design and rendered-acceptance target.

Runs after TASK-150.02 and before TASK-150.03. Build fresh presentation with typed inputs/action callbacks informed by product contracts; never import legacy/. Implement canvas, pane, navigation and inspector composition here. Dialog presentation follows in TASK-150.03. All archived product-logic copying and integration wait for TASK-150.07 after TASK-150.05; browser verification waits for TASK-150.06.

Browser-test execution is deferred to TASK-150.06 after all rebuild tasks report ready. Do not run browser suites, individual browser tests, browser smoke tests or aggregate commands that invoke them in this task. Continue strict lint/type checks and appropriate non-browser checks. Existing browser tests must not dictate the new UI. Any proposed browser-test replacement, behavioral/interaction rewrite, deletion or transfer to another test owner requires prior case-by-case approval by the orchestrating Astra agent, with the protected product contract and replacement evidence recorded. This is not a worker self-approval or an interim independent review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Navigation uses suitable official Sidebar, Collapsible and Button parts with stable plain board names, indented variants, two-line long names, a preview interface for real scene data connected in TASK-150.07 and a separate Scratch area.
- [ ] #2 Pane selection, action menus, disclosures, icon help and inspector actions use suitable shared Tabs or ToggleGroup, DropdownMenu, Collapsible, Tooltip and Button parts without adding redundant state or empty panels.
- [ ] #3 The new presentation represents independent boards/panes, fullscreen, persistence/connection/claim state, doing, selection/binding, code targets and path focus through typed inputs and action callbacks based on actual product contracts. Copying archived logic and connecting these operations belongs to TASK-150.07.
- [ ] #4 The canvas is dominant at 1920x1080 in light and dark themes, one-pane, two-pane and fullscreen layouts; presentation-only actions never write board notes.
- [ ] #5 The fresh shell presentation contains no legacy imports or transplanted CSS and passes strict and applicable non-browser checks. Runtime actions and data remain explicitly pending for TASK-150.07, with browser evidence pending for TASK-150.06.
<!-- AC:END -->

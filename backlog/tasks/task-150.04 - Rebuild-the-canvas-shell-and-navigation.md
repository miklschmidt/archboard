---
id: TASK-150.04
title: Build the fresh canvas shell and navigation
status: To Do
assignee: []
created_date: '2026-09-05 00:08'
updated_date: '2026-09-05 13:58'
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
The legacy shell scatters canvas navigation, status and controls across custom markup and CSS, slowing changes and obscuring the primary canvas workflow. Rebuild it with the shared shadcn and Tailwind foundation while preserving every product capability. coordinator owns composition decisions.  Do not start an independent reviewer loop until every TASK-150 implementation child reports complete.

The application shell is desktop-only, with 1920×1080 as its explicit design and rendered-acceptance target. Mobile/phone layouts, mobile navigation, mobile breakpoints and mobile test gates are out of scope. Do not introduce them during this rework.

Smaller desktop windows retain the same composition: the canvas flexes and overflowing content scrolls where needed. Keep existing panel collapse controls usable. Do not add alternate compact/mobile layouts or require a fixed 1920×1080 minimum window. 1920×1080 remains the design and rendered-acceptance target.

Runs after TASK-150.02 and before TASK-150.03. Build fresh presentation with typed inputs/action callbacks informed by product contracts; never import legacy/. Implement canvas, pane, navigation and inspector composition here. Dialog presentation follows in TASK-150.03. All archived product-logic copying and integration wait for TASK-150.07 after TASK-150.05; browser verification waits for TASK-150.06.

Browser-test execution is deferred to TASK-150.06 after all rebuild tasks report ready. Do not run browser suites, individual browser tests, browser smoke tests or aggregate commands that invoke them in this task. Continue strict lint/type checks and appropriate non-browser checks. Existing browser tests must not dictate the new UI. Any proposed browser-test replacement, behavioral/interaction rewrite, deletion or transfer to another test owner requires prior case-by-case approval by the implementation coordinator, with the protected product contract and replacement evidence recorded. This is not a worker self-approval or an interim independent review.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Navigation uses suitable official Sidebar, Collapsible and Button parts with stable plain board names, indented variants, two-line long names, a preview interface for real scene data connected in TASK-150.07 and a separate Scratch area.
- [ ] #2 Pane selection, action menus, disclosures, icon help and inspector actions use suitable shared Tabs or ToggleGroup, DropdownMenu, Collapsible, Tooltip and Button parts without adding redundant state or empty panels.
- [ ] #3 The new presentation represents independent boards/panes, fullscreen, persistence/connection/claim state, doing, selection/binding, code targets and path focus through typed inputs and action callbacks based on actual product contracts. Copying archived logic and connecting these operations belongs to TASK-150.07.
- [ ] #4 The canvas is dominant at 1920x1080 in light and dark themes, one-pane, two-pane and fullscreen layouts; presentation-only actions never write board notes.
- [ ] #5 The fresh shell presentation contains no legacy imports or transplanted CSS and passes strict and applicable non-browser checks. Runtime actions and data remain explicitly pending for TASK-150.07, with browser evidence pending for TASK-150.06.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
3. Build the fresh canvas shell and navigation. TASK-150.04.
Depends on TASK-150.02. coordinator UI workers following coordinator's composition.
Map the navigator to official Sidebar parts, Collapsible groups and Button actions, with plain stable board names, indented variants, two-line long names and a separate Scratch area. Define preview presentation to consume real scene data supplied by the later integration; do not invent canonical or persisted board content. Map pane choices to the suitable Tabs/ToggleGroup parts, action menus to DropdownMenu, supporting disclosures to Collapsible, icon help to Tooltip, and inspector actions to Button. Use Tailwind grid/flex and shared separators for header, navigator, canvas, optional inspector and workbench.
Preserve open/new/save/clear/install, both panes and their independent boards, fullscreen transfer/stop/recovery, persistence and connection state, claims/doing/take-back control, selection/binding/code-target/opening and path focus. Show implemented state only; avoid redundant status bars and empty panels.
Compose the shell from the approved reference and new shared components. Read product contracts to represent independent panes, navigation, inspection and recovery accurately, but supply typed view inputs/action callbacks rather than porting archived logic. Do not import or recreate retired header/navigation/inspector/pane CSS or markup. Product-action wiring and real data connection belong to TASK-150.07.
Exit: reference-led 1920x1080 desktop composition, one/two-pane and fullscreen presentation, navigator and inspector components are implemented with typed inputs/callbacks; strict and applicable non-browser checks pass. Runtime integration remains pending for TASK-150.07. Rendered/browser proof belongs to TASK-150.06.

Current execution constraints: preserve all completed corrections and the user's test deletions. Do not restore deleted tests or add repository-policy suites, configuration snapshots, dependency/version mirrors, tests of upstream tooling, or tests of test helpers. Use the existing lint/compiler commands and meaningful existing product checks. New strict lint adoption is limited to src/ui; remaining non-UI adoption is TASK-151. UI uses the existing root TypeScript project; do not create src/ui/tsconfig.json. Run analysis sequentially and keep the repository project guard on all lint/fix paths. No callbacks to previous tasks, fixed agent assignments, or extra interim review loops.
<!-- SECTION:PLAN:END -->

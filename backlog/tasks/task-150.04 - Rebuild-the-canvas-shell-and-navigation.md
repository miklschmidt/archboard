---
id: TASK-150.04
title: Build the fresh canvas shell and navigation
status: Done
assignee:
  - '@claude'
created_date: '2026-09-05 00:08'
updated_date: '2026-09-05 15:26'
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
- [x] #1 Navigation uses suitable official Sidebar, Collapsible and Button parts with stable plain board names, indented variants, two-line long names, a preview interface for real scene data connected in TASK-150.07 and a separate Scratch area.
- [x] #2 Pane selection, action menus, disclosures, icon help and inspector actions use suitable shared Tabs or ToggleGroup, DropdownMenu, Collapsible, Tooltip and Button parts without adding redundant state or empty panels.
- [x] #3 The new presentation represents independent boards/panes, fullscreen, persistence/connection/claim state, doing, selection/binding, code targets and path focus through typed inputs and action callbacks based on actual product contracts. Copying archived logic and connecting these operations belongs to TASK-150.07.
- [x] #4 The canvas is dominant at 1920x1080 in light and dark themes, one-pane, two-pane and fullscreen layouts; presentation-only actions never write board notes.
- [x] #5 The fresh shell presentation contains no legacy imports or transplanted CSS and passes strict and applicable non-browser checks. Runtime actions and data remain explicitly pending for TASK-150.07, with browser evidence pending for TASK-150.06.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Worker (2026-09-05) extends the committed frame (63d634f3): navigator from real BoardListing (vault/open/onScreen/Draft markers, variants, two-line names, Scratch, needs-name, refresh, error); lazy previews via exportToSvg through projectPreviewSnapshot/BoardPreviewCache/PreviewRequestGate in src/ui/board-preview/preview-card.tsx; pane bar with per-pane status, claim banner, take-back state, add/close/present, view mode when disconnected, min-w-0 so the canvas flexes; selection-inspector pure union module + presentation; path-focus pure union module + non-persistent overlay; dock doing lines and pulse; CodeTargetNoticeAction notices; fullscreen presentation with recovery. Gates: fmt, lint, type-check, build, pure-helper Bun tests. Dialog hosting is integrated by the coordinator after TASK-150.03.

Shell completion pass (worker): 1. Pure roots src/ui/selection-inspector/index.ts (SelectionProjection union + sameSelectionProjection) and src/ui/path-focus/index.ts (PathFocusSnapshot union, PathFocusOverlay, samePathFocusSnapshot) with Bun tests. 2. src/ui/board-preview/preview-card.tsx lazy exportToSvg card behind IntersectionObserver, gate and cache. 3. Grow ShellView/ShellActions: listing error, refresh, draft/on-screen markers, scratch placeholder, per-pane takeBack state, path focus + overlay, presentation live/recovery union, notice action union with CodeTargetNoticeAction shapes, dismiss. 4. Navigator, pane bar with status lines, claim banner, focus overlay, inspector, dock doing lines and pulse, presentation recovery; header shrink fix. 5. Update the temporary fixture. Verify: fmt, lint, type-check, build, focused bun tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Shell completion pass (uncommitted): new pure roots src/ui/selection-inspector/index.ts (SelectionProjection union, sameSelectionProjection) and src/ui/path-focus/index.ts (PathFocusSnapshot/PathFocusOverlay, comparators) with Bun tests; src/ui/selection-inspector/inspector.tsx; src/ui/board-preview/preview-card.tsx (lazy exportToSvg behind IntersectionObserver, gate + cache, revokes late URLs); shell lib: navigator-entries.ts, pane-bar.tsx, claim-banner.tsx, path-focus-overlay.tsx, time.ts; contracts grew (boardsError, refreshBoards, nameBoard, takeBack state, pathFocus + overlay, presentation live/recovery, notice action union with CodeTargetNoticeAction shapes, dismissNotice, exitPathFocus, Shell voiceControls slot). Header take-back moved into the per-pane claim banner; header shrinks/truncates. Verified: bun run fmt; lint and tsc clean for shell/selection-inspector/path-focus/board-preview/application (whole-repo lint:ui and type-check fail only in concurrent untracked src/ui/voice-wave, src/ui/workbench-thread and src/ui/opener-settings); bun run build exit 0; focused tests 12 pass. No browser verification.

Checkpoint e699dac3: navigator from real BoardListing with lazy exportToSvg previews (preview-card.tsx), pane bar/claim banners/take-back state, selection-inspector and path-focus pure modules with tests (12 pass, confined), inspector presentation, path-focus overlay, presentation recovery variant, notice actions. Scoped UI lint exit 0 for shell/selection-inspector/path-focus/board-preview/application/canvas; build exit 0. Full-tree gate re-run once concurrent workers land. Arrow-key navigation is a keydown handler without roving tabindex; 1360px header fix by layout reasoning, browser proof deferred to TASK-150.06.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fresh shell presentation (commits 63d634f3, e699dac3): Sidebar/Collapsible navigator from the real BoardListing with Scratch, drafts, on-screen markers and lazy real-scene previews; ToggleGroup pane bar, DropdownMenu actions, Tooltip help, Button inspector actions; typed ShellView/ShellActions for panes, fullscreen, persistence/connection/claim/doing, selection, code targets and path focus; no legacy imports or transplanted CSS. Verified by scoped strict lint, type-check, build and 12 pure-helper tests; canvas dominance in both themes seen in a preview design inspection; browser proof remains TASK-150.06.
<!-- SECTION:FINAL_SUMMARY:END -->

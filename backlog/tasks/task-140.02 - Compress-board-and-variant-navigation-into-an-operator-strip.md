---
id: TASK-140.02
title: Compress board and variant navigation into an operator strip
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 02:30'
updated_date: '2026-08-30 08:23'
labels: []
dependencies:
  - TASK-140.01
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - src/ui/shell/BoardNavigator.tsx
  - src/ui/shell/shell.css
  - tests/system/browser/board-navigator.test.ts
  - tests/system/browser/shell-layout.test.ts
  - tests/system/browser/support/agent-browser.ts
  - tests/system/repository-policy/ci-browser-gate.test.ts
  - package.json
  - docs/agents/test-suite.md
parent_task_id: TASK-140
priority: medium
type: enhancement
ordinal: 158000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recompose the existing Board atlas as the compact left project strip in the approved reference. People should scan and switch among real boards, variants, drafts, and on-screen boards with less chrome and more room for the canvas. This is a presentation change over the existing board listing contract, not a thumbnail-generation system.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The strip presents every named board and variant from the existing listing and distinguishes current, on-screen, open, and draft state without inventing preview content
- [x] #2 Selecting a board or variant still opens it into the focused pane, and busy, empty, loading, refresh-failure, scratch, and contextual naming states remain accurate and actionable
- [x] #3 New board, refresh, and name-this-board actions remain available with accessible names, focus order, and touch targets
- [x] #4 The strip uses less desktop width than the current Board atlas and adapts at 420 pixels without covering the canvas or hiding the current board
- [x] #5 Rendered browser coverage proves navigation, focused-pane replacement, scratch naming, empty and failure states, and the desktop and narrow layouts
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Recompose the existing BoardNavigator data and actions into a compact desktop operator strip while preserving every listing row, current/on-screen/open/draft marker, stable selector, and navigation callback.
2. Reduce desktop strip width and flatten group/variant presentation without adding generated or illustrative thumbnails; retain real board initials and metadata only.
3. Preserve loading, empty, refresh failure/retry, scratch, and contextual naming states with accessible labels, 44px actions, keyboard focus order, and exact focused-pane replacement.
4. Adapt the compact strip at 420px without page overflow or canvas overlap; sort the current group and variant first, scroll them into view, and retain nested strip scrolling so arbitrarily large real board and variant listings remain reachable.
5. Keep shell-layout focused on shared geometry and register a separate canonical board-navigator browser owner for listing, recovery, naming, markers, focused-pane replacement, and narrow reachability; validate lint, format, both TypeScript projects, inventory, build, focused browser owners, and current renders.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a 184px desktop board operator strip (176px at the intermediate breakpoint) over the existing real listing contract. The current and on-screen groups sort first, the selected variant sorts first and scrolls into view, on-canvas/open/draft markers remain distinct, all large listings and variants remain reachable through nested narrow strip scrolling, and all mutation actions fail closed while busy. No preview or generated thumbnail data was added.

Validation: full lint, both TypeScript projects, formatting and diff checks pass; shell-layout passes 79 assertions; the new canonical board-navigator owner passes 2 cases/42 assertions for delayed real loading, empty, retry/recovery, scratch naming, every board/variant marker, two-pane focused replacement, 44px targets, 184px desktop, and 420px reachability. Inventory and CI browser policies pass 81 cases/164 assertions with all 17 owners registered. Current 1440x900 and 420x900 dark renders were inspected.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Compressed the real board and variant navigator into a 184px operator strip with current-first reachability, explicit on-canvas/open/draft state, focused-pane replacement, and scalable 420px scrolling. Verified 121 focused browser assertions, both TypeScript projects, lint/format, current desktop/narrow renders, and the 17-owner inventory boundary.
<!-- SECTION:FINAL_SUMMARY:END -->

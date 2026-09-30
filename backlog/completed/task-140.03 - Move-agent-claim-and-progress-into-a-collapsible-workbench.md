---
id: TASK-140.03
title: Move agent claim and progress into a collapsible workbench
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 02:30'
updated_date: '2026-08-30 08:43'
labels: []
dependencies:
  - TASK-140.01
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - src/ui/shell/AgentWorkbench.tsx
  - src/ui/shell/AgentRail.tsx
  - src/ui/shell/Shell.tsx
  - src/ui/shell/shell.css
  - tests/system/browser/claim-interaction.test.ts
  - tests/system/browser/shell-layout.test.ts
parent_task_id: TASK-140
priority: high
type: enhancement
ordinal: 159000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the permanent right Agent activity rail with the bottom workbench composition from the approved reference. The workbench must present the focused pane real connection, claim, and doing state while giving the canvas more horizontal room. It controls only behavior Archboard already owns, including Take back control; it does not add Pause, Send, a prompt box, or a hidden proposed-diff flow.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The workbench can be expanded and collapsed and shows the focused pane Ready, Working, or Offline state, active claim reason, latest doing entry, and recent doing history from existing live data
- [x] #2 Take back control remains available during an active agent claim and has the same immediate board-release behavior and human-authority guarantee as the current control
- [x] #3 Empty history, active claim, progress updates, disconnect, reconnect, release, and take-back states are accurate, inspectable, and announced accessibly
- [x] #4 The workbench does not cover Excalidraw controls, remains associated with the focused pane in a two-pane layout, yields the canvas the larger region, and stays hidden in fullscreen presentation
- [x] #5 Rendered browser coverage proves collapse and restore, focused-pane transfer, live progress, disconnect and recovery, claim and take-back, and desktop and 420 pixel layouts
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Replace the permanent AgentRail placement with a bottom AgentWorkbench inside the canvas zone, preserving the existing focused-pane connection, claim, doing, recent-history, and Take back callbacks and stable state selectors where useful.
2. Add an accessible expand/collapse control and live state summary; expanded content shows active claim reason, latest doing, and recent history from the existing real PaneStatus/LockHolder data only.
3. Recompose the workspace to the navigator plus canvas columns so the canvas gains the former right-rail width; keep the workbench clear of Excalidraw controls, associated with focused pane A/B, responsive at 420px, and hidden only in confirmed fullscreen.
4. Preserve empty, working, ready, offline, reconnect, release, claim, and take-back behavior; do not add Pause, Send, prompt input, proposed diff, or another agent client.
5. Update focused shell/claim browser owners or add one canonical workbench owner within inventory limits to prove collapse/restore, pane transfer, progress, disconnect/recovery, claim/take-back, desktop/420 geometry, and fullscreen hiding; inspect current renders and validate lint, format, both TypeScript projects, build, inventory, and focused owners.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a bottom AgentWorkbench inside the canvas zone and removed the permanent right rail. The workbench defaults collapsed, follows focused Pane A/B state, announces Ready/Working/Offline plus claim/latest data, exposes scrollable claim/latest/history content when expanded, and calls the existing takeBack callback unchanged. The workspace now gives the former rail width to the canvas and browser-confirmed fullscreen hides the workbench only after :fullscreen is active.

Validation: bun run lint; bun run fmt:check; bun run type-check (server and frontend projects); bun run build; git diff --check. Focused browser lane passed shell-layout 1 case/82 assertions, fullscreen-presentation 1/42, and claim-interaction 1/57. The owners prove collapse/restore, focused-pane transfer, live progress, empty history, disconnect/reconnect, claim/release/take-back, desktop and 420 pixel geometry, and fullscreen hiding. Real 1440x900 and 420x700 light/dark collapsed and expanded renders were inspected at /home/msc/.codex/visualizations/2026/08/30/01a05089-3ed3-71d3-8ea4-e84da1e7bf5d/workbench-*.png; the workbench remains below the pane, controls stay clear, content remains reachable, and the collapsed canvas stays dominant. Protected non-goal audit found no Pause, Send, prompt, proposed-diff, or second-client UI.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved real focused-pane connection, claim, doing, history, and Take back control into an accessible collapsible bottom workbench, returning the permanent right-rail width to the canvas without adding a new agent interaction path. Verified with lint, formatting, both TypeScript projects, production build, 181 focused browser assertions across shell/fullscreen/claim owners, and inspected desktop plus 420 pixel light/dark renders.
<!-- SECTION:FINAL_SUMMARY:END -->

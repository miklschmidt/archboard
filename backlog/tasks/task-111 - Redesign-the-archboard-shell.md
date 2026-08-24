---
id: TASK-111
title: Redesign the archboard shell
status: Done
assignee:
  - '@codex'
created_date: '2026-08-23 23:32'
updated_date: '2026-08-24 00:48'
labels: []
dependencies: []
modified_files:
  - frontend/src/canvas/CanvasPane.tsx
  - frontend/src/shell/AgentRail.tsx
  - frontend/src/shell/BoardBar.tsx
  - frontend/src/shell/BoardNavigator.tsx
  - frontend/src/shell/Icons.tsx
  - frontend/src/shell/Modal.tsx
  - frontend/src/shell/Shell.tsx
  - frontend/src/shell/shell.css
  - scripts/check-fixed-point.mjs
  - scripts/check-live-session.mjs
type: enhancement
ordinal: 113000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Replace the dated, flat frontend shell with a modern interface that gives board identity, live state, core actions, pane context, agent activity, notices, and dialogs a clear visual hierarchy without changing the canvas model or server contracts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The shell presents board identity, variant, level, persistence state, connection state, and core actions in a coherent modern hierarchy
- [x] #2 Open, new, contextual draft naming, split, clear, theme, notice, conflict, and board dialog flows remain usable with large touch targets
- [x] #3 Single-pane and two-pane layouts remain clear, and narrow viewports do not clip, overlap, or hide essential controls
- [x] #4 Agent claims and recent doing entries are readable without covering each other or obscuring the canvas controls
- [x] #5 Light and dark themes both have intentional contrast, focus, hover, disabled, warning, and danger states
- [x] #6 Real-browser regression coverage and current browser screenshots verify the redesigned shell at desktop and narrow widths
- [x] #7 The full bun run test gate passes
- [x] #8 A persistent board navigator groups boards with their variants, marks what is on screen, and opens a selection into the focused pane
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Adopt the approved clean-room mockup as the visual source of truth: its neutral/brass light and dark tokens, aligned three-column shell, structural dividers, and horizontal focused-board glow.
2. Restructure the real shell into an aligned brand/identity/actions header, Board atlas sidebar, canvas zone with pane tabs, dedicated Agent activity rail, and compact status bar while preserving all board and pane behavior.
3. Move claim and doing presentation from canvas overlays into the activity rail, keeping the existing take-back control and browser-facing selectors so nothing covers Excalidraw controls.
4. Rework the persistent navigator into board families with nested variants, on-screen/focused states, and a separate scratch naming affordance; keep selections opening into the focused pane.
5. Restyle notices and dialogs with the approved visual system, retain 44 px touch targets, and add responsive behavior that keeps essential navigation and actions reachable without clipping.
6. Update browser regression assertions, build, run focused and full tests, then inspect current desktop dark/light, split-pane, and narrow pixels before finalizing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Adopted the approved clean-room prototype rather than continuing the earlier visual direction. The shell now uses its neutral/brass token system and aligned 290px / canvas / 340px structure. Agent claim and doing state moved out of CanvasPane overlays into a dedicated AgentRail driven by the focused pane; the existing take-back behavior and selectors remain intact. The Board atlas groups named boards and nested variants, marks on-canvas state, opens into the focused pane, and keeps scratch naming separate.

Validation: final bun run test passed all 26 suites, including fixed-point browser rendering, 420px responsive shell assertions, variant navigation, and the 42-cycle live human/agent session. Current in-app browser pixels were inspected at 1440x900 in light and dark themes, at 420x700, in one- and two-pane layouts, with an active agent claim, after take-back, and with the Open board dialog.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-08-23 23:47
---
Removed the permanent Save action after review: named boards already write through on every gesture. Scratch now gets a contextual Name board action; conflict recovery remains attached to the not-saving state.
---

author: @codex
created: 2026-08-24 00:26
---
Adopting the clean-room shell mockup approved after review, including its final divider alignment and restored horizontal brass glow.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adopted the approved shell prototype as the real frontend: aligned Board atlas, canvas and Agent activity columns; neutral/brass light and dark themes; a dedicated non-overlapping agent rail; pane tabs and status strip; responsive 420px composition; and contextual scratch naming with no redundant Save action. Verified by the complete bun run test gate and fresh in-app browser passes across desktop, narrow, split, claim/take-back, dialog, light and dark states.
<!-- SECTION:FINAL_SUMMARY:END -->

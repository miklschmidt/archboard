---
id: TASK-140.01
title: Adopt the operator shell visual system and wordmark
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 02:29'
updated_date: '2026-08-30 07:44'
labels: []
dependencies:
  - TASK-139
references:
  - docs/design/operator-canvas-shell.md
modified_files:
  - src/ui/canvas/CanvasPane.tsx
  - src/ui/shell/BoardBar.tsx
  - src/ui/shell/shell.css
  - tests/system/browser/shell-layout.test.ts
parent_task_id: TASK-140
priority: high
type: enhancement
ordinal: 157000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Move the existing shell from the TASK-111 neutral and brass treatment to the approved operator reference. A person should get a quieter, denser frame around the canvas while every real board, pane, persistence, connection, conflict, and action state stays visible and usable. TASK-139 lands first so this change can adopt the final fullscreen boundary instead of racing it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The header uses the compact lowercase archboard wordmark without an icon tile and presents real board identity, pane, connection, vault, hold, and note state without mock data
- [x] #2 Light and dark themes share one token system with the reference cobalt selection and lime status accents, accessible text and control contrast, visible focus, and no gradient or glow decoration
- [x] #3 Open, new, split, clear, opener settings, theme, conflict recovery, notices, and contextual scratch naming remain reachable with accurate labels and states
- [x] #4 The canvas receives the largest share of the desktop workspace, and one-pane, two-pane, fullscreen, and 420 pixel layouts fit without clipping or hiding essential controls
- [x] #5 Stable browser checks exercise the rendered light and dark desktop shells and the narrow shell, and current screenshots are inspected through the real application
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the finalized TASK-139 fullscreen owner and every TASK-111 callback, selector, notice, conflict, dialog, touch-target, and pane-state contract while replacing only shell composition and styling.
2. Recompose BoardBar as a 56-pixel operator header with the lowercase archboard wordmark, no icon tile, real board/variant/level/vault/connection/persistence data, and the existing actions in a dense two-zone layout.
3. Replace the neutral/brass tokens and decorative gradients, glow, texture, and shadows in shell.css with shared flat light/dark neutrals, cobalt selection, lime live status, one-pixel rules, small radii, visible focus, and monospaced secondary data.
4. Tighten the intermediate desktop workspace and exact 420-pixel responsive shell without pre-implementing the later navigator, workbench, inspector, or focus tasks; keep the canvas the largest single region and keep all fullscreen-only hiding gated by confirmed browser fullscreen.
5. Extend the canonical shell-layout browser owner to prove lowercase branding, flat theme tokens, desktop and 420-pixel geometry, light/dark operation, 44-pixel actions, and preserved navigation. Run focused browser, fullscreen, type, lint, format, build, and diff checks; inspect fresh rendered light/dark desktop, narrow, one-pane, two-pane, notice/conflict, and fullscreen states before recording evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the approved flat operator shell on top of finalized TASK-139. The header is 56px on desktop with the lowercase icon-free wordmark, cobalt #155eef selection and lime #a3e635 status tokens, no gradients/glow/shadow treatment, preserved real state and callbacks, and compact 44px actions at 420px. Fixed a pre-existing bidirectional Excalidraw theme feedback loop with a pending-theme handshake so the header theme control cannot bounce React into a maximum-depth unmount.

Validation: lint, both TypeScript projects, diff check, production frontend builds, shell-layout 1/80, fullscreen 1/42, hold-generation 1/23, human-hold-persistence 1/44, claim-interaction 1/47, and opener-settings 1/37 all pass through the canonical browser lane. Current 1440x900 dark and 420x900 dark/light screenshots were inspected from the real app; the inspection caught and drove remediation of a clipped narrow action strip, now enforced by a scroll-width assertion.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Adopted the compact operator visual system and lowercase archboard wordmark while preserving the finalized fullscreen, conflict, claim, opener, pane, and vault contracts. Verified both TypeScript projects, lint, production build, 253 focused browser assertions across six canonical owners, and current rendered desktop plus 420px light/dark screenshots.
<!-- SECTION:FINAL_SUMMARY:END -->

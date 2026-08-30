---
id: TASK-144.02
title: Compile one canonical Tailwind application stylesheet
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
labels: []
dependencies:
  - TASK-144.01
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - src/ui/theme
parent_task_id: TASK-144
priority: high
type: task
ordinal: 216000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the Tailwind Vite/build seam and one `src/ui/theme` application entrypoint. Excalidraw vendor CSS stays separate and the merged TASK-140 reset remains authoritative.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Vite loads one `tailwindcss()` plugin and the frontend imports one canonical Archboard application stylesheet exactly once.
- [ ] #2 The stylesheet imports Tailwind theme/utilities without Preflight; enabling Preflight requires separate rendered evidence and is not part of this leaf.
- [ ] #3 A production build proves Tailwind utilities compile while existing Excalidraw, one/two-pane, fullscreen, and desktop shell controls remain unchanged.
<!-- AC:END -->

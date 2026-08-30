---
id: TASK-144.02
title: Configure Tailwind 4 in Vite
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 15:46'
labels: []
dependencies:
  - TASK-144.01
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - vite.config.js
parent_task_id: TASK-144
priority: high
type: task
ordinal: 216000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own only the Tailwind 4 build plugin seam in `vite.config.js`. Add the official `@tailwindcss/vite` plugin once beside React; stylesheet creation, import, token migration, and shell CSS belong to separate leaves.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Vite loads exactly one tailwindcss() plugin after React and defines the one @ alias to the repository src directory; root/output/proxy/chunk behavior remains unchanged.
- [ ] #2 A focused production fixture proves a Tailwind utility from src/ui/theme/app.css and an @/ui import resolve with no second PostCSS, config, plugin, alias namespace, or Preflight path.
- [ ] #3 Existing frontend build and Vite tests prove Excalidraw assets, one/two-pane shell, fullscreen, and proxy behavior remain unchanged; TASK-144.15 owns the matching TypeScript path.
<!-- AC:END -->

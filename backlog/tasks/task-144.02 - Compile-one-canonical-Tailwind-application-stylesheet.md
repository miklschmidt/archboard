---
id: TASK-144.02
title: Configure Tailwind 4 in Vite
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 16:58'
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
Configure Tailwind 4's Vite plugin and @/ runtime alias. Verification here uses a disposable self-contained Vite/Tailwind/alias fixture; production stylesheet and shell proof belong to TASK-144.13-.14.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 vite.config.js registers the pinned @tailwindcss/vite plugin once and maps @/ to the absolute repository src directory without changing frontend root, proxy, Excalidraw handling, or output naming.
- [ ] #2 A disposable fixture imports Tailwind, scans a static class through the @/ alias, and proves generated utility output with no dependence on production app.css, shell.tsx, or later tasks.
- [ ] #3 Missing plugin, wrong alias target, alias escape, duplicate plugin, and production config drift fail with actionable fixture output.
- [ ] #4 The task claims only configuration/fixture behavior; rendered production proof remains owned by TASK-144.13, TASK-144.14, and TASK-144.11.
<!-- AC:END -->

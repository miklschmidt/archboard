---
id: TASK-144
title: Adopt Tailwind 4 and shadcn/Base UI as the Archboard UI foundation
status: To Do
assignee: []
created_date: '2026-08-30 14:32'
updated_date: '2026-08-30 16:58'
labels: []
dependencies:
  - TASK-140
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
  - docs/agents/boundaries.md
  - docs/design/codex-workbench-delivery-map.md
priority: high
type: enhancement
ordinal: 170000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Map completed TASK-140 into a Tailwind 4 foundation and use shadcn/Base UI as immutable reviewed source delivery. Nineteen leaves serialize dependencies/lockfile, Vite/root/frontend/lint aliases, CSS import/theme/token integration, shadcn inputs, classes, native formatting, separate button/dialog modules, opener, automated owners, and UI-agent guidance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 TASK-144.01-.19 compose one canonical Tailwind stylesheet/theme, exact resolver agreement, immutable shadcn base-nova inputs, separate button/dialog modules, one opener consumer, automated format/browser/doc owners, and mandatory aesthetic guidance without rewriting the shell.
- [ ] #2 Oxfmt uses native Tailwind v4 sorting and actual helper names; existing strict native Oxlint remains, with no custom Tailwind lint, second formatter, copied defaults, warning allowance, or speculative cva.
- [ ] #3 Preflight stays off, Excalidraw CSS stays separate, TASK-140 tokens integrate through semantic variables, pinned source provenance/hashes are tracked, and default aesthetics/icons/unneeded dependencies are removed.
- [ ] #4 Frozen install, resolver aliases, both TypeScript projects, lint policy, format fixture, production build, module tests, opener browser owner, rendered shell equivalence, AGENTS link, and repository enforcement prove the result.
<!-- AC:END -->

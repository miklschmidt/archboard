---
id: TASK-144
title: Adopt Tailwind 4 and shadcn/Base UI as the Archboard UI foundation
status: To Do
assignee: []
created_date: '2026-08-30 14:32'
updated_date: '2026-08-30 16:25'
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
Map completed TASK-140 into a Tailwind 4 foundation and use shadcn/Base UI as reviewed source delivery. Eighteen leaves serialize dependencies/lockfile, Vite/root/frontend/lint aliases, CSS import/theme/shell migration, shadcn, classes, native formatting, dialog/opener, exact automated owners, and enforced UI-agent guidance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 TASK-144.01-.18 compose one canonical Tailwind stylesheet/theme, exact Vite/root/frontend/Oxlint alias resolution, shadcn base-nova configuration, named UI boundaries, one proven Base UI dialog/button consumer, automated format/browser/doc owners, and mandatory aesthetic guidance without rewriting the shell.
- [ ] #2 Oxfmt uses native Tailwind v4 sorting and actual helper names; existing strict native Oxlint rules remain, with no custom Tailwind lint, second formatter, copied upstream defaults, warning allowance, or speculative cva.
- [ ] #3 Preflight stays off, Excalidraw CSS stays separate, TASK-140 tokens migrate to one theme, official dialog/button source hashes are recorded, and generated default aesthetics/icons/unneeded dependencies are reduced out.
- [ ] #4 Frozen install, all resolver aliases, both TypeScript projects, lint alias enforcement, native format owner, production build, module tests, opener browser owner, shell regressions, AGENTS link, and repository enforcement prove the result.
<!-- AC:END -->

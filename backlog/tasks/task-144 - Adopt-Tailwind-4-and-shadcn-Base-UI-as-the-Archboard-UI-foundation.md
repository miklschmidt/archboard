---
id: TASK-144
title: Adopt Tailwind 4 and shadcn/Base UI as the Archboard UI foundation
status: To Do
assignee: []
created_date: '2026-08-30 14:32'
updated_date: '2026-08-30 15:16'
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
Map the completed TASK-140 desktop operator shell into a Tailwind 4 development foundation and use shadcn configured for Base UI as reviewed source delivery. Nine leaves own dependency/build, theme, configuration, class composition, native formatting, one dialog, one real migration, and durable aesthetic guidance. Tailwind/shadcn/Base UI supply mechanics and development speed; TASK-140 remains visual authority.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 TASK-144.01-.09 compose one canonical Tailwind stylesheet/theme, explicit Base UI shadcn source-delivery configuration, named UI boundaries, one proven dialog consumer, and linked aesthetic guidance without rewriting the completed shell.
- [ ] #2 Oxfmt uses native Tailwind v4 sorting and actual helper names. New UI remains under the existing strict native Oxlint React/jsx-a11y/type-aware baseline; no custom Tailwind Oxlint rule, external Tailwind linter, second formatter, or repository copy of changing upstream defaults is added.
- [ ] #3 Preflight remains off, Excalidraw CSS stays separate, semantic tokens map the merged TASK-140 light/dark visual system, and copied source removes unused/default aesthetics rather than importing a generic component bucket.
- [ ] #4 Frozen install, both TypeScript projects, lint, format, production build, focused module tests, and real-browser opener/shell regression prove accessible keyboard/focus/dismissal behavior and unchanged supported desktop/Excalidraw workflows.
<!-- AC:END -->

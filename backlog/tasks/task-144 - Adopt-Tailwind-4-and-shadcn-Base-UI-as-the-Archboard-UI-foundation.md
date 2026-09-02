---
id: TASK-144
title: Adopt Tailwind 4 and shadcn/Base UI as the Archboard UI foundation
status: To Do
assignee: []
created_date: '2026-08-30 14:32'
updated_date: '2026-09-02 01:37'
labels: []
dependencies:
  - TASK-140
  - TASK-143.08.05
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
Keep the completed Tailwind 4 and shadcn/Base UI foundation, then let TASK-143.08 remove test machinery that only re-tests tool resolution, fixture cleanup, or copied configuration. The resulting product has one canonical application stylesheet and semantic theme, one alias contract, reviewed Base UI source modules, and direct build and rendered opener evidence. Completed leaf records remain historical.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 One canonical Tailwind stylesheet and semantic theme, exact resolver agreement, immutable reviewed shadcn Base UI inputs, separate button and dialog modules, one opener consumer, and mandatory aesthetic guidance remain in production after recovery.
- [ ] #2 Oxfmt uses native Tailwind v4 sorting and actual helper names, strict native Oxlint remains deny-warnings clean, and no custom Tailwind lint, second formatter, copied defaults, warning allowance, or speculative cva is introduced.
- [ ] #3 Preflight stays off, Excalidraw CSS stays separate, TASK-140 tokens flow through semantic variables, pinned source provenance remains reviewable, and default aesthetics, icons, and unneeded dependencies stay removed.
- [ ] #4 Frozen install, ordinary TypeScript and lint resolution, normal format check, a real Vite production build, the style-entry owner, opener browser workflow, rendered shell equivalence, and repository boundaries prove the result without dedicated tool-cleanup process suites.
<!-- AC:END -->

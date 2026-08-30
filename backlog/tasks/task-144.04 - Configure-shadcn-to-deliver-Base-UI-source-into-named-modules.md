---
id: TASK-144.04
title: Configure shadcn to deliver Base UI source into named modules
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 15:49'
labels: []
dependencies:
  - TASK-144.01
  - TASK-144.03
  - TASK-144.13
  - TASK-144.17
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - components.json
parent_task_id: TASK-144
priority: high
type: task
ordinal: 218000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own `components.json` as the shadcn 4.19.0 source-delivery configuration. Choose `base-nova`, neutral generation values, Base UI, RSC false, TSX/CSS variables true, blank Tailwind config, `src/ui/theme/app.css`, and aliases into named modules.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The file fixes style base-nova, rsc false, tsx true, tailwind.config empty, css src/ui/theme/app.css, baseColor neutral, cssVariables true, empty prefix, components @/ui, ui @/ui/dialog, utils/lib @/ui-classnames, and hooks @/ui/hooks.
- [ ] #2 iconLibrary is explicitly lucide only as the official registry-generation input; accepted source replaces generated icon imports with src/ui/shell/Icons.tsx and TASK-144.01 proves lucide-react is not retained.
- [ ] #3 The reproducible command is bun run shadcn add dialog --yes using pinned shadcn 4.19.0 and official @shadcn/dialog under base-nova; no init, add-all, overwrite, or third-party registry command is accepted.
- [ ] #4 Schema/CLI dry-run plus Vite, root TypeScript, and frontend TypeScript prove exact aliases/destination without components/ui, generic lib bucket, unresolved imports, unreviewed blocks, or runtime CLI code.
<!-- AC:END -->

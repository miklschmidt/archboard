---
id: TASK-144.04
title: Configure shadcn to deliver Base UI source into named modules
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
labels: []
dependencies:
  - TASK-144.02
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
Own `components.json` plus the matching resolver aliases as one source-delivery configuration seam. Generated source must land in named `src/ui/<module>` boundaries rather than a generic component bucket.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Configuration selects an explicit Base UI `base-*` style, React Server Components false, CSS variables true, Tailwind v4 blank config, the canonical stylesheet, and the existing Archboard icon strategy.
- [ ] #2 Aliases resolve identically in Vite, root TypeScript, and frontend TypeScript and target named module roots; no `components/ui`, generic utility bucket, or unreviewed registry block is generated.
- [ ] #3 A pinned CLI dry-run/smoke and both TypeScript projects prove the configuration without making the CLI a browser runtime or application state owner.
<!-- AC:END -->

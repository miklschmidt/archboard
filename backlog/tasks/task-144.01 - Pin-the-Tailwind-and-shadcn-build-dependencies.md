---
id: TASK-144.01
title: Pin the Tailwind and shadcn build dependencies
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
labels: []
dependencies: []
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - package.json
parent_task_id: TASK-144
priority: high
type: task
ordinal: 215000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the direct dependency seam in `package.json` and `bun.lock` for Tailwind 4's official Vite integration and the shadcn source-delivery CLI. Runtime component/helper dependencies are added only by the leaf that demonstrates their concrete use.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Exact mutually compatible `tailwindcss` 4, `@tailwindcss/vite`, and `shadcn` versions are direct pinned development dependencies and frozen Bun install succeeds.
- [ ] #2 No Lucide, animation, registry runtime, Radix, Base UI, class helper, or second styling dependency is added speculatively by this leaf.
- [ ] #3 Dependency inspection distinguishes Archboard direct imports from Excalidraw transitive packages and records no publication or runtime dependency on the shadcn CLI.
<!-- AC:END -->

---
id: TASK-144.01
title: Pin the Tailwind and shadcn build dependencies
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 15:43'
labels: []
dependencies:
  - TASK-143.02.04
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
Own the one serialized root dependency seam in `package.json` and `bun.lock` for the accepted Tailwind/Base UI foundation. Pin every already-named direct dependency needed by later leaves; no later TASK-144 leaf mutates package metadata.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Exact dev dependencies are tailwindcss 4.3.3, @tailwindcss/vite 4.3.3, and shadcn 4.19.0; exact runtime dependencies are clsx 2.1.1, tailwind-merge 3.6.0, and @base-ui/react 1.7.0.
- [ ] #2 package.json adds one shadcn script that invokes the pinned local CLI, while class-variance-authority, lucide-react, tw-animate-css, Radix, AI SDK, registry runtimes, second styling systems, and speculative helpers are absent.
- [ ] #3 A frozen Bun install, dependency inspection, type-check, frontend build, and bun run shadcn --help pass; bun.lock is updated here and registry/source provenance remains implementation input rather than a browser dependency.
- [ ] #4 This edit follows TASK-143.02.04 and precedes the separately serialized @assistant-ui/react dependency leaf so concurrent Luna tasks never own package.json.
<!-- AC:END -->

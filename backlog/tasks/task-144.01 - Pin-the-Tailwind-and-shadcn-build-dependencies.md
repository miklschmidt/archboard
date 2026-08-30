---
id: TASK-144.01
title: Pin the Tailwind and shadcn build dependencies
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 16:58'
labels: []
dependencies:
  - TASK-143.01.13
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - package.json
  - bun.lock
parent_task_id: TASK-144
priority: high
type: task
ordinal: 215000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the serialized root package.json/bun.lock seam for the accepted Tailwind/Base UI foundation. Pin every reviewed direct dependency needed by later TASK-144 leaves and audit the resulting transitive graph; assistant-ui is added only by the later serialized TASK-143.03.12.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Exact dev dependencies are tailwindcss 4.3.3, @tailwindcss/vite 4.3.3, and shadcn 4.19.0; exact runtime dependencies are clsx 2.1.1, tailwind-merge 3.6.0, and @base-ui/react 1.7.0.
- [ ] #2 package.json adds one shadcn script invoking the pinned local CLI; no app code directly imports @radix-ui, assistant-cloud, registry runtime, class-variance-authority, lucide-react, tw-animate-css, AI SDK, second styling system, or speculative helper.
- [ ] #3 Frozen Bun install, dependency/license inspection, type-check, frontend build, and bun run shadcn --help pass; an explicit reviewed transitive allowlist records unavoidable helper packages instead of asserting Radix or later assistant-ui transitives are absent.
- [ ] #4 This root edit follows the exact Codex pin/conformance TASK-143.01.13 and precedes the separately serialized @assistant-ui/react TASK-143.03.12; no other ready leaf owns package.json or bun.lock.
<!-- AC:END -->

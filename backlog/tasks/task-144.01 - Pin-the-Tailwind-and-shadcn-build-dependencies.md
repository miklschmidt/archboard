---
id: TASK-144.01
title: Pin the Tailwind and shadcn build dependencies
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 22:43'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the accepted Tailwind/Base UI dependency set and current root package seam against the reviewed adoption research, preserving the exact Codex 0.151.0 pin and existing scripts.
2. Add only the six exact reviewed direct dependencies and one shadcn script using the pinned local CLI; regenerate bun.lock without introducing later assistant-ui or speculative styling/runtime packages.
3. Audit the complete transitive dependency and license graph, record the explicit unavoidable helper allowlist in the task evidence, and challenge forbidden Radix/assistant/cloud/registry/helper additions.
4. Prove frozen install, bun run shadcn --help, both TypeScript projects, frontend build, lint, format, repository/module gates as relevant, diff, and clean status without touching application code.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Batch reservation at integration HEAD 7023de7: exact newly ready scoped leaves are TASK-143.01.18 and TASK-144.01. They are path-disjoint: one repository-policy owner versus the serialized package/lock seam. TASK-143.01.16 remains an active timing remediation and TASK-143.01.07 is in read-only review, so three leaf-worker slots are occupied after dispatch. Slot 4 is intentionally unused because no other TASK-143/TASK-144 leaf is ready; other scoped entries are parent containers or dependency-blocked, and TASK-141/TASK-142 are unrelated CI-restoration bugs.
<!-- SECTION:NOTES:END -->

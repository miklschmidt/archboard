---
id: TASK-144.05
title: Compose static Tailwind classes through one UI module
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-08-31 00:15'
labels: []
dependencies:
  - TASK-144.01
  - TASK-144.03
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - src/ui/ui-classnames
parent_task_id: TASK-144
priority: high
type: task
ordinal: 219000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own static class joining in `src/ui/ui-classnames` using the already-pinned clsx 2.1.1 and tailwind-merge 3.6.0. Expose one `cn` function; no variant abstraction is introduced until a named consumer proves it necessary.

Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The public module exposes cn only, imports exact direct helpers from TASK-144.01, and accepts complete statically detectable class strings.
- [ ] #2 Tailwind names are never interpolated or assembled from fragments; exhaustive component state maps remain in their owning UI modules.
- [ ] #3 class-variance-authority and a repository-owned variant DSL are absent; tests at src/ui/ui-classnames/tests cover conflict resolution, falsy inputs, deterministic order, and named-entrypoint-only imports.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add src/ui/ui-classnames/index.ts with the sole public export cn, directly composing clsx 2.1.1 into tailwind-merge 3.6.0 and accepting clsx-compatible inputs.
2. Add independent module-root tests under src/ui/ui-classnames/tests for Tailwind conflict groups including Archboard semantic tokens, falsy/nested inputs, deterministic ordering and duplicate handling, arbitrary/non-Tailwind preservation, caller nonmutation, independent calls, and named-entrypoint-only imports.
3. Verify the focused module lane, module/repository lanes, both TypeScript projects, lint, formatting, and frontend build; audit diff/status for protected files before handoff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.03 finalized at integration HEAD 741b442. This leaf owns only src/ui/ui-classnames and its module tests; it consumes the already pinned clsx/tailwind-merge and canonical theme without adding a variant DSL or touching UI consumers.

Implemented src/ui/ui-classnames/index.ts as the sole cn entrypoint with direct clsx 2.1.1 then tailwind-merge 3.6.0 composition. Added public-module tests for export shape, semantic/stock conflict precedence, variant isolation, clsx falsy/nested values, deterministic ordering, duplicate handling, arbitrary class preservation, input nonmutation, and independent calls. The focused run initially established that default tailwind-merge preserves unknown named radius tokens, so no custom configuration was added. Validation: focused module tests pass; bun run test:modules (1042 pass); bun run test:repository (130 pass); bun run type-check; bun run lint; bun run fmt:check; bun run build.
<!-- SECTION:NOTES:END -->

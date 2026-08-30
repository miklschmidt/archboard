---
id: TASK-144.05
title: Compose static Tailwind classes through one UI module
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 15:43'
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
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The public module exposes cn only, imports exact direct helpers from TASK-144.01, and accepts complete statically detectable class strings.
- [ ] #2 Tailwind names are never interpolated or assembled from fragments; exhaustive component state maps remain in their owning UI modules.
- [ ] #3 class-variance-authority and a repository-owned variant DSL are absent; tests at src/ui/ui-classnames/tests cover conflict resolution, falsy inputs, deterministic order, and named-entrypoint-only imports.
<!-- AC:END -->

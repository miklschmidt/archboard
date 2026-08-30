---
id: TASK-144.04
title: Configure shadcn to deliver Base UI source into named modules
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 16:25'
labels: []
dependencies:
  - TASK-144.05
  - TASK-144.15
  - TASK-144.17
  - TASK-144.18
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
Configure shadcn base-nova for Base UI source delivery into named Archboard modules after every resolver and class helper is proven. Pin exact upstream dialog and button source hashes; reviewed local modules remain authoritative.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 components.json selects base-nova, Base UI, TypeScript, CSS variables, Tailwind 4 stylesheet, and aliases components @/ui, ui @/ui, lib @/ui, utils @/ui/ui-classnames, hooks @/ui; no cva, icon library, or generated theme is accepted.
- [ ] #2 The dry-run hash-gates dialog source SHA-256 99e9d7851f7d00fa85cd66157dd6ee3d6759f149a0a2b850d837407fba61648f and button source SHA-256 434eb70c9158f687770752468a88fd9e164417620ab7047da10d06fe923a04bc before reduction.
- [ ] #3 Dry-run generation resolves Vite, both TypeScript aliases, Oxlint, and ui-classnames consistently and reports upstream drift without modifying the checkout.
- [ ] #4 Only reviewed named source files may be copied; future shadcn updates must repeat provenance, hash, dependency, accessibility, aesthetic, and boundary review.
<!-- AC:END -->

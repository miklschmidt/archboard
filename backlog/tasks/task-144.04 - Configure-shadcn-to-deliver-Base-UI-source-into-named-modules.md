---
id: TASK-144.04
title: Configure shadcn to deliver Base UI source into named modules
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 16:58'
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
  - docs/design/vendor/shadcn-base/button.tsx
  - docs/design/vendor/shadcn-base/dialog.tsx
parent_task_id: TASK-144
priority: high
type: task
ordinal: 218000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Configure shadcn base-nova for Base UI source delivery after every resolver/helper is proven. Pin reviewed upstream source at commit b4a618b97e35f5dadf3a00d51f410c84a2567d4d and track exact source fixtures; mutable main is provenance only. Delegation profile: gpt-5.6-luna, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 components.json selects base-nova/Base UI/TypeScript/CSS variables/Tailwind 4 with aliases components/ui/lib @/ui, utils @/ui/ui-classnames, hooks @/ui and no cva/icon/theme dependency.
- [ ] #2 Tracked immutable fixtures are exact bytes from shadcn-ui/ui commit b4a618b97e35f5dadf3a00d51f410c84a2567d4d: button SHA-256 97bfee456444f0495deee6a321933c24267477645b0bf4bfea67c3c62d425a12 and dialog 85f9a33d1a8c495b0faecd066dae1581b8feb5d27f912ecf65f814386f6da3a9.
- [ ] #3 A dry-run resolves all aliases/lint/helper config, compares generated inputs to tracked fixtures, reports upstream drift, and never modifies the checkout.
- [ ] #4 Only reviewed named source may be copied; future updates repeat immutable provenance, hash, dependency, accessibility, aesthetic, and boundary review.
<!-- AC:END -->

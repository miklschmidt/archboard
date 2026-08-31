---
id: TASK-144.04
title: Configure shadcn to deliver Base UI source into named modules
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-08-31 03:15'
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
- [ ] #1 components.json is byte-equivalent JSON to the reviewed literal: schema URL, style base-nova, rsc false, tsx true, tailwind config empty/css src/ui/theme/app.css/baseColor neutral/cssVariables true/prefix empty, and components/ui/lib/hooks @/ui plus utils @/ui/ui-classnames aliases.
- [ ] #2 iconLibrary is intentionally omitted because the schema has no local-icon value. A non-mutating dry-run may report its default, but package/source adoption is refused; button/dialog fixtures match the immutable commit and exact hashes.
- [ ] #3 The dry-run uses finished Vite/TypeScript/Oxlint aliases, validates literal components.json, compares generated inputs to tracked fixtures, reports default/icon/upstream drift, and never modifies the checkout.
- [ ] #4 Only reviewed named source may be copied; reductions remove icon/default helpers and future updates repeat provenance, hash, dependency, accessibility, aesthetic, and boundary review.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the reviewed base-nova components literal, pinned upstream commit, existing aliases, and vendor fixture provenance. 2. Write only the exact components.json and immutable button/dialog source fixtures, intentionally omitting iconLibrary. 3. Add a non-mutating dry-run owner that validates literal config, alias agreement, fixture bytes/hashes, default/icon/upstream drift, and checkout cleanliness without package/source adoption. 4. Run focused config/provenance/dry-run/type/lint/format/inventory/diff checks; leave broad lanes to root caps.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved after TASK-144.18 finalized at integration HEAD 4cbceec. This ready leaf owns components.json, the two pinned vendor fixtures, and its narrow dry-run evidence; it is disjoint from active shell-token remediation and assistant-ui dependency work.
<!-- SECTION:NOTES:END -->

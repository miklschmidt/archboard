---
id: TASK-144.08
title: Migrate opener settings onto the Base UI dialog
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:11'
updated_date: '2026-08-31 05:20'
labels: []
dependencies:
  - TASK-144.19
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - src/ui/opener-settings
parent_task_id: TASK-144
priority: high
type: task
ordinal: 222000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Migrate the existing opener settings consumer onto the reviewed Base UI dialog/button and semantic Tailwind contract. Delegation profile: gpt-5.6-sol, high for routine UI implementation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The opener retains the existing settings state owner, save/cancel semantics, validation, labels, and trigger; only presentation/interaction primitives move to the reviewed dialog/button modules.
- [ ] #2 The consumer uses semantic Tailwind classes and named module entrypoints without direct @base-ui or Radix imports, copied portal/focus state, inline style policy, or second modal store.
- [ ] #3 Module tests cover props, state transition requests, and classes only; TASK-144.11 owns rendered focus, Escape, outside-dismissal, portal, accessibility, themes, reduced motion, and touch.
- [ ] #4 Existing opener errors and unsaved values survive dismiss/refocus behavior exactly as specified by its current public contract.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved for implementation and independent review at integration HEAD 0ed8963628b1519990536d0d1b42137d9e83be7c. Scope is limited to src/ui/opener-settings and its focused evidence; TASK-144.11 retains rendered interaction ownership.
<!-- SECTION:NOTES:END -->

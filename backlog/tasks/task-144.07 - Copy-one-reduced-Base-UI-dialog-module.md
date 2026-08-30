---
id: TASK-144.07
title: Copy one reduced Base UI dialog module
status: To Do
assignee: []
created_date: '2026-08-30 15:11'
updated_date: '2026-08-30 15:43'
labels: []
dependencies:
  - TASK-144.03
  - TASK-144.04
  - TASK-144.05
  - TASK-144.06
  - TASK-144.14
references:
  - docs/design/operator-canvas-shell.md
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - src/ui/dialog
parent_task_id: TASK-144
priority: high
type: task
ordinal: 221000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the first reviewed shadcn/Base UI source slice in `src/ui/dialog`. Run the TASK-144.04 command, record the resolved official registry URL and SHA-256, then reduce the result to the minimum Archboard dialog API using @base-ui/react 1.7.0 and local icons.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The module exposes only Root, Trigger, Portal, Backdrop, Popup, Title, Description, Close, and application-controlled open/change composition needed by opener settings; unused variants, palette defaults, animation packages, cva, and Lucide source/dependency are removed.
- [ ] #2 A source provenance note records pinned shadcn 4.19.0, base-nova @shadcn/dialog resolution URL/hash, reduction decisions, and local src/ui/shell/Icons.tsx replacement without committing registry cache.
- [ ] #3 Focus trap/return, Escape, outside dismissal, labels/descriptions, disabled actions, portal stacking, visible focus, and controlled/open transitions work under shell isolation.
- [ ] #4 Tests at src/ui/dialog/tests use semantic Tailwind utilities and pass strict native Oxlint React/jsx-a11y/type-aware rules without weakening, custom Tailwind rules, application state, or second primitive family.
<!-- AC:END -->

---
id: TASK-144.19
title: Copy the reduced Base UI dialog module
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 16:58'
updated_date: '2026-08-31 04:50'
labels: []
dependencies:
  - TASK-144.20
references:
  - docs/design/vendor/shadcn-base/dialog.tsx
  - docs/design/tailwind-base-ui-adoption-research.md
modified_files:
  - src/ui/dialog
parent_task_id: TASK-144
priority: high
type: task
ordinal: 254000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Copy and reduce only the pinned Base UI dialog fixture after the button module exists. It owns one deep module and delegates rendered interaction to the existing opener browser owner. Delegation profile: gpt-5.6-sol, high.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The local dialog preserves Base UI controlled/open state, roles, labels/descriptions, focus trap/restoration, Escape, portal, outside-dismissal policy, and refs through a small Archboard API.
- [ ] #2 It consumes the named button entrypoint and semantic tokens; default aesthetics, icons, demos, duplicate state, and unused helpers are removed.
- [ ] #3 Module tests prove exported API, props/types, deterministic classes, and pure controlled state only; TASK-144.11 owns rendered focus/portal/a11y.
- [ ] #4 Provenance records the immutable commit, dialog hash, dependency on the accepted button module, reduction date, and local ownership.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved immediately after TASK-144.20 finalized at integration HEAD f526f0328bb1212dc85f94ea44e31af1261910cb. This leaf owns src/ui/dialog and focused module evidence. It must reduce only the pinned dialog fixture, consume the accepted Button module and semantic class path, preserve Base UI controlled/open, focus, portal, Escape, outside-dismissal, labeling, and ref contracts, and leave rendered interaction to TASK-144.11.
<!-- SECTION:NOTES:END -->

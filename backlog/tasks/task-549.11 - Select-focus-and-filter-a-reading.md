---
id: TASK-549.11
title: Select, focus, and filter a reading
status: To Do
assignee: []
created_date: '2026-10-26T05:25:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.10
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 941000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 11.

## What to build

Readers need to isolate a question directly from the elements on screen.

A reader selects by dragging, toggles subjects with Ctrl/Cmd-click, and focuses the result. Keyboard users receive equivalent actions.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.10
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A reader selects by dragging, toggles subjects with Ctrl/Cmd-click, and focuses the result. Keyboard users receive equivalent actions.
- [ ] #2 Space-drag and middle-button drag pan. Escape clears selection. Selection and highlighting never wait for layout or flood browser history.
- [ ] #3 Focus preserves mixed ancestor and descendant selections. It expands only the required paths and retains necessary endpoint context.
- [ ] #4 Visible controls filter relationship kinds and groups. Hidden selections retain an inspector count and reveal action. These actions change no architecture files.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

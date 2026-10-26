---
id: TASK-549.23
title: Install and recover an explicit vault migration
status: To Do
assignee: []
created_date: '2026-10-26T05:26:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.17
  - TASK-549.22
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 953000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 23.

## What to build

Format replacement must survive interruption and refuse source changes after preview.

An owner applies a complete migration preview. The operation retains original inputs before replacing the live format and switching every surface to the canonical model.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.17, TASK-549.22
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An owner applies a complete migration preview. The operation retains original inputs before replacing the live format and switching every surface to the canonical model.
- [ ] #2 Changed source or target inputs require a new preview or explicit recovery. Interrupted cutover resumes through the existing journal without losing either representation.
- [ ] #3 A repeated completed migration is a no-op. Only one format remains authoritative. CLI, server, browser, and local agents use the new runtime afterward.
- [ ] #4 The same workflow supports Git-backed and untracked vaults. Cache and subscription changes follow durable completion. Ownership transfer controls explain that transfer is unavailable.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

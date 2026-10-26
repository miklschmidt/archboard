---
id: TASK-549.04
title: Author module structure and transfer relationships
status: To Do
assignee: []
created_date: '2026-10-26T05:24:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.03
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 934000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 4.

## What to build

Agents need to change module boundaries and connections without duplicating definitions or replacing identities.

An agent adds, removes, renames, or reparents modules and edits their relationships through normal commands. The browser reflects the resulting model.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.03
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent adds, removes, renames, or reparents modules and edits their relationships through normal commands. The browser reflects the resulting model.
- [ ] #2 One operation can transfer a relationship source between files without changing its identity. Deletion repairs references under the existing confirmation rules.
- [ ] #3 Extend claims and stale-read coverage to every affected subject and file. Conflicting claims refuse admission, while unrelated subjects remain available.
- [ ] #4 Preserve reserved identities, former names, authored order, and containment rules. A one-field edit leaves unrelated files byte-identical.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

---
id: TASK-549.24
title: Make canonical models the default and retire live board paths
status: To Do
assignee: []
created_date: '2026-10-26T05:26:00Z'
updated_date: '2026-10-26T11:20:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.13
  - TASK-549.16
  - TASK-549.18
  - TASK-549.23
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 954000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 24.

## What to build

The finished product needs one live model format and one authoring path.

New vaults use canonical models. Migrate the repository's architecture vault through the delivered workflow and retire the old live authoring paths.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.13, TASK-549.16, TASK-549.18, TASK-549.23
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 New vaults use canonical models. Migrate the repository's architecture vault through the delivered workflow and retire the old live authoring paths.
- [ ] #2 Keep legacy decoding only for migration and retained historical readings. Remaining unmigrated vaults receive an explicit migration route, never an automatic rewrite.
- [ ] #3 Close the consumer transition across commands, agent context, code inspection, rendering, walkthroughs, and examples. Earlier slices own their functional changes and documentation.
- [ ] #4 Remove obsolete board ownership and level instructions. Complete the glossary, ADR, skill, and architecture updates without introducing a second storage abstraction.
- [ ] #5 Demonstrate the local workflow from discovery through proposal, adoption, history, and walkthrough. Reuse the focused evidence already owned by each slice.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Keep the interface-width ceilings introduced on main intact. Retire the superseded legacy public APIs during cutover so the completed migration fits the existing board ceiling. The temporary dual-model implementation currently adds 21 public names to board. Do not hide these names behind a namespace or raise the ceiling.
<!-- SECTION:PLAN:END -->

---
id: TASK-549.01
title: Read one canonical module model
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-26T05:24:00Z'
updated_date: '2026-10-26T05:30:00Z'
labels:
  - ready-for-agent
dependencies: []
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 931000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 1.

## What to build

Overlapping board documents prevent readers from inspecting one consistent repository model.

Deliver a coherent read of an authored model vault through the public runtime, CLI, and server. Readers can inspect its root modules and relationships.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

None. This ticket can start immediately.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Deliver a coherent read of an authored model vault through the public runtime, CLI, and server. Readers can inspect its root modules and relationships.
- [ ] #2 Include the manifest, qualified identities, module definitions, source-owned relationships, policy, and strict file discovery. Preserve ordering, groups, evidence, bindings, and document references.
- [ ] #3 Names resolve only when unique. Filename changes preserve identity. Duplicate definitions, invalid containment, unsupported formats, and missing local targets produce structured diagnostics.
- [ ] #4 The returned revision covers discovered paths and exact bytes. The browser lists root modules and opens their authored details.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

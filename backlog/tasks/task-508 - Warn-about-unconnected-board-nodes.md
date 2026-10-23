---
id: TASK-508
title: Warn about unconnected board nodes
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-23 02:24'
updated_date: '2026-10-23 02:26'
labels: []
dependencies: []
ordinal: 915000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Readers need boards to explain connections. An isolated node can signal a missing relationship or a part that belongs elsewhere.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The vault check warns for each node with no connection to another node in current and draft variants.
- [ ] #2 Relationships, flow exchanges, and containment count as connections. Self calls and presentation membership do not.
- [ ] #3 Diagnostics identify the node and describe linking, moving, or deleting it.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a content diagnostic within the existing board checker. No architecture board is affected because this extends existing validation without changing its parts or connections. 2. Add focused behavior coverage and update consumer guidance. 3. Run the complete gate and commit the change.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented NODE_UNCONNECTED in the existing vault checker. Connections include containment, relationships, and nested flow messages between distinct nodes. Current and draft variants are checked. Historical and shelved variants remain unchanged. Focused tests pass. Simplicity pass kept one set of connected ids and reused existing variant and flow traversal rules.
<!-- SECTION:NOTES:END -->

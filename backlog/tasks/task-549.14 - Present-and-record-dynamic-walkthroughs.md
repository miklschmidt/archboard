---
id: TASK-549.14
title: Present and record dynamic walkthroughs
status: In Progress
assignee:
  - '@codex-backend'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T22:55:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.06
  - TASK-549.12
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 944000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 14.

## What to build

Presentations need to move through architectural readings while preserving one consistent revision.

An agent authors narrative beats that change scope, selection, filters, grammar, and flow. A reader plays them without saved geometry or architecture copies.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.06, TASK-549.12
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent authors narrative beats that change scope, selection, filters, grammar, and flow. A reader plays them without saved geometry or architecture copies.
- [ ] #2 Playback resolves current, a named proposal, or an exact checkpoint once. The entire presentation retains that revision.
- [ ] #3 Changes offer restart against a newer state. Missing subjects or history stop the affected beat with a recovery explanation.
- [ ] #4 Recording and shared playback use an exact retained revision. Existing local recording and rendering remain the execution owners.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implement backend and CLI only in feat/backend-recording-replay. Parent owns frontend and browser acceptance.
1. Publish the exact walkthrough read/write and recording contract in the durable state directory.
2. Create draft TASK-549.14 proposals on Board persistence, Archboard server routes, Command interface, and Board rasterizer.
3. Use public architecture operations with real files and Git for each red-green slice: narrative authoring, compact proposals, pinned playback, and retained recording inputs.
4. Extend existing local recording and replay contracts without adding an engine. Update consumer instructions, ADRs, and test ownership.
5. Simplify, merge the latest integration tip, run affected evidence, sign checkpoints, release claims, and publish the backend handoff. Leave criteria unchecked and proposals draft.
<!-- SECTION:PLAN:END -->

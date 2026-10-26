---
id: TASK-549.14
title: Present and record dynamic walkthroughs
status: In Progress
assignee:
  - '@codex-backend'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T23:23:00Z'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend delivery is implemented on feat/backend-recording-replay. Signed checkpoint da8989345 adds canonical narrative inputs, shared authoring, compact walkthrough/beat subjects, revision-pinned playback, and the existing local recording/replay contract extension. Signed merge 175b081c8 includes integration ae6afbf8be81fdea3b7f8be23157b138bcd3c31f (TASK-549.15). The public reader composes playback and existing navigation through one fourth options object.
The durable early contract is /home/msc/.local/state/archboard-implementation/task-549/task-549.14-contract.md. The final backend handoff will be task-549.14-backend.md beside it.
Draft proposals retain their original ancestors and all integrated histories: Board persistence@TASK-549.14 (msQamUgX), Archboard server routes@TASK-549.14 (rzormOzN), Command interface@TASK-549.14 (joCzpG5O), and Board rasterizer@TASK-549.14 (fFECebqp). They describe backend ownership only. Parent owns frontend/browser acceptance, including canonical recording and replay page consumption. Criteria remain unchecked and proposals remain draft.
Types, lint, formatting, evaluation input validation, CLI/HTTP narrative routing, CLI contract generation/help, and the package graph pass. The four affected draft boards have zero warning findings. The full vault code check reports 10 warnings elsewhere. The interface-width gate reports board 245 names against ceiling 188. Export declarations, package exports, and ceilings exactly match the integration tip. No rule or budget was changed. The combined domain regression run remains in progress at this note.

The combined runtime run completed: 134 tests pass across narrative authoring/playback, compact proposals, structural transactions, claims, recovery, archives, references, and local talk contracts. Final CLI and transport follow-up passes 10 tests, including occupied talk-directory usage refusal and output preservation. Canonical and legacy recording now share that existing directory helper. Types and formatting pass; final lint is running. Package graph passes. The inherited interface-width refusal and unrelated vault code warnings remain documented. No browser or live voice work ran. All four claims are released, and only this worktree server was stopped. The parent retains frontend acceptance and ticket/proposal completion.

Final lint completed with zero errors and zero warnings. Final types and formatting pass. The source checkout is ready for the parent handoff. TASK-549.14 remains In Progress with unchecked criteria and draft proposals.
<!-- SECTION:NOTES:END -->

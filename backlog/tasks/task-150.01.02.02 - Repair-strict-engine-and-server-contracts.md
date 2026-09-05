---
id: TASK-150.01.02.02
title: Repair strict engine and server contracts
status: To Do
assignee: []
created_date: '2026-09-05 04:35'
updated_date: '2026-09-05 13:58'
labels: []
dependencies: []
references:
  - TASK-150
  - docs/agents/strict-analysis.md
  - docs/agents/boundaries.md
modified_files:
  - src/runtime/engine/describe.ts
  - src/runtime/engine/lib/describe-scene-model.ts
  - src/runtime/engine/lib/describe-lines.ts
parent_task_id: TASK-150.01.02
priority: high
type: task
ordinal: 301000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deferred to TASK-151. Preserve all committed and uncommitted corrections in this historical repair scope. Remaining non-UI strict-rule adoption is outside TASK-150 and does not block the UI rebuild.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Existing corrections remain intact.
- [ ] #2 Remaining non-UI adoption is owned by TASK-151; this historical leaf does not block TASK-150 UI construction.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Do not resume this repair leaf during TASK-150. TASK-151 owns any later non-UI adoption after its scope is agreed. Preserve current changes and user-deleted tests. Historical evidence remains for context only.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Compiler checkpoint: repaired exact optional-property construction and exhaustive-return contracts across engine/server without changing synchronous note writes, lease/version enforcement, pane notification ordering, queue semantics or recovery. Latest primary compiler snapshot /tmp/task-150-root-cross-worker-20260905.log had only two owned diagnostics outside excluded application.ts; projection control flow was repaired afterward and awaits primary refresh.
Focused non-browser evidence: board-write-observers 4/4 isolated; label placement/repair 3/3; canvas terminal cleanup/text actions 8/8; gateway/spoken approval 33/33. A combined six-file Bun invocation produced one board-write observer vault-resolution failure while 24 other cases passed; the exact observer file then passed 4/4 alone, so shared-state interference remains for the primary serial lane to assess.
Scoped type-aware lint inventory /tmp/task-150-engine-server-lint-current.json reports 9,606 diagnostics and 22 over-500-line files in exact ownership. No lint/compiler rule was weakened and no suppression was added. Coordinator retained full lint/line scope and requested responsibility-based decomposition approval; first proposal covers describe.ts scene normalization/folding into a private model module while preserving its public narration contract.

Approved describe cluster decomposition implemented: describe.ts public API/narration orchestration is 455 lines; private describe-scene-model.ts is 287 lines and owns projection/folding/scene facts; private describe-lines.ts is 295 lines and owns text formatting. Public describe/selection owners pass 8/8, repository boundary/strict-policy owners pass 10/10, and max-lines is zero for the cluster. Remaining cluster lint is 376 diagnostics and remains active.
Read-only audit of the unsupported combined-owner failure found `/home/msc/Work/Platform-Architecture/architecture-vault/.archboard/locks/proof-external.lock` and no matching proof/observer note or other named fixture. No cleanup or live-vault mutation was performed; canonical isolated module-owner commands remain authoritative.
<!-- SECTION:NOTES:END -->

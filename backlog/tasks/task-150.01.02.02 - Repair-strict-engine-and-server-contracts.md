---
id: TASK-150.01.02.02
title: Repair strict engine and server contracts
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-05 04:35'
updated_date: '2026-09-05 04:43'
labels: []
dependencies: []
references:
  - TASK-150
  - docs/agents/strict-analysis.md
  - docs/agents/boundaries.md
parent_task_id: TASK-150.01.02
priority: high
type: task
ordinal: 301000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Restore strict compiler and lint confidence in retained src/runtime/engine and src/server after checkpoint f9cee0b09d6630693412abb31d9763e8e4ae9a86. Exclude src/server/board-rendering and src/server/canvas/lib/application.ts, which the primary repair owner controls. Preserve synchronous atomic note writes, locks, one-write operations, transport and recovery while fixing exact optional/return/schema contracts. Visible Daybreak low worker, disjoint shared-checkout ownership and one primary broad validation lane.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Assigned engine/server source and module tests pass full applicable strict compiler/lint policy without weakening rules or required mutation/serialization semantics.
- [ ] #2 Focused non-browser module checks protect board writes, persistence, version/lock errors and server contracts affected by repairs.
- [ ] #3 Changes stay within the assigned paths and exclusions, with cross-module interface requests coordinated; no archive porting, server lifecycle interference or browser execution.
- [ ] #4 Report changed paths, HEAD, evidence, justified local exceptions and risks; commits are serialized and final statuses wait for final review.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Repair exact-optional and return contracts reported by the scoped strict compiler inventory without changing write, lock, queue, or recovery semantics.
2. Run focused scoped lint, resolve applicable diagnostics and 500-line ownership violations at their real module contracts.
3. Run focused non-browser module tests for affected engine/server behavior, record evidence and preserved-work audit, and report to the coordinator for serial broad validation and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Compiler checkpoint: repaired exact optional-property construction and exhaustive-return contracts across engine/server without changing synchronous note writes, lease/version enforcement, pane notification ordering, queue semantics or recovery. Latest primary compiler snapshot /tmp/task-150-root-cross-worker-20260905.log had only two owned diagnostics outside excluded application.ts; projection control flow was repaired afterward and awaits primary refresh.
Focused non-browser evidence: board-write-observers 4/4 isolated; label placement/repair 3/3; canvas terminal cleanup/text actions 8/8; gateway/spoken approval 33/33. A combined six-file Bun invocation produced one board-write observer vault-resolution failure while 24 other cases passed; the exact observer file then passed 4/4 alone, so shared-state interference remains for the primary serial lane to assess.
Scoped type-aware lint inventory /tmp/task-150-engine-server-lint-current.json reports 9,606 diagnostics and 22 over-500-line files in exact ownership. No lint/compiler rule was weakened and no suppression was added. Coordinator retained full lint/line scope and requested responsibility-based decomposition approval; first proposal covers describe.ts scene normalization/folding into a private model module while preserving its public narration contract.
<!-- SECTION:NOTES:END -->

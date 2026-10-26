---
id: TASK-549.06
title: Create and compare compact proposals
status: In Progress
assignee:
  - '@codex-compact-proposals'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T18:19:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.05
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 936000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 6.

## What to build

Complete proposal snapshots make small architecture changes produce large review diffs.

An agent creates a proposal spanning modules and flows. CLI and browser readers materialize and compare it from a retained baseline and identity-based changes.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.05
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent creates a proposal spanning modules and flows. CLI and browser readers materialize and compare it from a retained baseline and identity-based changes.
- [ ] #2 Support siblings, named predecessors, and planning-only models without a current state. New draft subjects remain outside current architecture until adoption.
- [ ] #3 Preserve stable state identities, names, summaries, and documents. Additions, removals, assignments, explicit clearing, and placements have distinct meanings.
- [ ] #4 Comparison defaults follow TASK-549. Unsupported predecessor changes refuse safely until reconciliation is available. Small edits store no unrelated snapshots.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm signed integration base 24f76895d and preserve completed flow, reader, and archive contracts.
2. Create draft Board persistence@TASK-549.06, Command interface@TASK-549.06, and Archboard server routes@TASK-549.06 proposals.
3. Record the early backend contract outside the repository. Use TDD at the approved architecture read/write seam with real files and Git.
4. Add compact identity changes, retained immutable baselines, state selection, metadata, safe predecessor refusal, and semantic comparisons through existing readers and durable writes.
5. Expose the contract through normal CLI and HTTP adapters. Update consumer guidance, examples, ADRs, test ownership, and evaluation inputs without model evaluation.
6. Run focused behavior, type, lint, formatting, and architecture checks. Simplify, merge latest integration, release claims, stop the server, and sign all commits.
7. Leave browser acceptance and task completion to the parent. Keep architecture proposals draft and TASK-549.06 In Progress.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend and CLI only. Initial HEAD equals feat/canonical-module-model at 24f76895d1555418782e973b021c4aceeb5a7f5c. No child agents, frontend source, browser tests, review phase, push, or PR changes. The owner already approved the public architecture read/write seam with real temporary files and Git.
<!-- SECTION:NOTES:END -->

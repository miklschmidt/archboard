---
id: TASK-549.02
title: Retain and reopen exact architecture checkpoints
status: In Progress
assignee:
  - '@codex-backend'
created_date: '2026-10-26T05:24:00Z'
updated_date: '2026-10-26T08:14:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.01
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 932000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 2.

## What to build

Historical readings need retained architecture inputs that survive changes to the code branch.

An agent retains an architecture reading locally. CLI and browser readers reopen it after current files change. Historical reads never mix in current content.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.01
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An agent retains an architecture reading locally. CLI and browser readers reopen it after current files change. Historical reads never mix in current content.
- [ ] #2 Preserve required inputs through Git ancestry or retention refs. Honor configured identity and signing without changing the user index, HEAD, or checkout.
- [ ] #3 Concurrent archive appends preserve both checkpoints through marked synchronization commits. Archive order never selects current architecture or merges architectural meaning.
- [ ] #4 Linked worktrees share archive objects and refs. Exact reads identify missing architecture or source evidence and provide a recovery action.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep the agreed public runtime seam with real temporary files and Git repositories. The parent owns the existing browser seam.
2. Create TASK-549.02 draft proposals on Board persistence, Command interface, and Archboard server routes before architectural edits.
3. Add exact local retain/read/list contracts behind the architecture runtime, with configured signing, source evidence, shared worktree archive refs, dependency retention, and conditional append synchronization. Use one failing test before each behavior.
4. Expose the runtime through CLI, HTTP, and the canonical client. Update affected ADR/domain terms, consumer guidance, fixture workflow, and evaluated scenarios.
5. Run focused behavior tests and relevant type, lint, and formatting gates. Simplify, commit signed work, merge the latest integration tip, and record the backend handoff. Leave browser AC 1 and the ticket open.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Initial HEAD f1b91c9a98537a29238ac1575f45d2fcfd5d3259 equals feat/canonical-module-model and contains it. The worktree starts clean. Configured SSH signing succeeds through commit-tree and git verify-commit. Dependencies installed with bun install --frozen-lockfile without lock changes. No parent task notes will change.

Backend checkpoint: exact retain/read/list runtime and public CLI/HTTP/client contracts are implemented. Real red/green evidence is saved under /home/msc/.local/state/archboard-implementation/task-549/task-549.02-evidence. Proven slices include exact reads after current corruption, configured SSH signing and identity with dirty-index preservation, baseline ancestry and collection, concurrent linked-worktree synchronization, missing source evidence, durable operation retries, signing refusal, shallow missing baselines, reserved archive branch protection, Git-sensitive paths and large UTF-8 inputs, and unborn source history. TASK-549.02 proposals remain draft. Browser work remains with the parent.
<!-- SECTION:NOTES:END -->

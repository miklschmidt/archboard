---
id: TASK-549.16
title: Publish archive history and recover missing revisions
status: In Progress
assignee:
  - '@codex-archive-backend'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T12:54:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.02
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 946000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 16.

## What to build

A locally retained checkpoint does not guarantee that a collaborator can read it.

An owner explicitly publishes history to a configured remote and archive ref. A collaborator fetches a missing reading, including from a shallow clone.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.02
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An owner explicitly publishes history to a configured remote and archive ref. A collaborator fetches a missing reading, including from a shallow clone.
- [ ] #2 Distinguish saved-locally, publication-pending, published, and unavailable states. Normal code pushes never count as history publication.
- [ ] #3 Stale publication fetches and joins archive ancestry without force-pushing or merging model content. Fetches include the complete referenced history.
- [ ] #4 Publication setup establishes remote retention policy or reports its limitation. Network failure never reverses a completed local write.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm rebased ancestry and read the complete publication and recovery contracts.
2. Create Board persistence@TASK-549.16, Command interface@TASK-549.16, and Archboard server routes@TASK-549.16 proposals before code.
3. Publish a stable API/status contract outside the repository and implement one public-runtime TDD slice at a time with disposable signed repositories and bare remotes.
4. Add explicit configured publication, durable private status, complete history fetching, signed ancestry joins, retention limitations, and CLI/server adapters. Preserve current files, index, source HEAD, and exact identities.
5. Update consumer guidance, authored workflow examples, evaluation coverage, and ADR 0059. Run focused behavior owners and affected static gates.
6. Merge latest feat/canonical-module-model, resolve affected contracts, record parent UI work, release claims, stop this server, and leave signed checkpoints.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend assignment only. Required base baf552fde042b363b79a41dfcfcbaca1ef3e81bd and main 6cae688bb are ancestors of the provided clean branch. TASK-549.03 is not integrated and will not be absorbed. Its private write journal and current-edit APIs remain outside this slice. Browser publication states remain parent-owned. No push, PR action, subagent, or real repository archive publication is authorized.

Created task drafts on Board persistence, Command interface, and Archboard server routes before code. The early public contract is task-549.16-contract.md in the shared orchestration directory. First red test failed on the missing public status export. First green test passed through the public runtime with a signed disposable repository and local bare remote. Explicit publication persists evidence and preserves dirty index, current files, and source HEAD. Normal code publication does not create archive evidence.

Complete archive fetch passes for both a shallow source clone and an already truncated archive clone. Source HEAD, dirty index, authored current state, source fetch mapping, and the unrelated source shallow boundary remain unchanged. A red stale-push case became green through complete fetch plus a signed synchronization commit with both exact checkpoint parents. No force-push or semantic merge occurs. Initial source types identified one unused import, which was removed. The first composed shallow test exceeded the 15-second default because repeated exact reads duplicated Git probes; the runtime now reuses its returned reading and avoids those repeated probes.

Signed checkpoint cc9abce77 saves explicit publication and durable local status. Subsequent runtime cases prove complete fetching, signed stale-archive joins, signing refusal, private common-directory ownership across linked worktrees, changed-URL refusal without blocking local reads, complete pending-baseline status, and missing-identity diagnostics. CLI/server configuration, publish, fetch, and status adapters pass through the shared schemas, including a server restart. Publication metadata uses a separate private sidecar and receipt refs. It does not reuse or replace TASK-549.03 current-edit recovery.
<!-- SECTION:NOTES:END -->

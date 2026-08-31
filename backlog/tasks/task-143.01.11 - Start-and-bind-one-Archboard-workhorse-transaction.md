---
id: TASK-143.01.11
title: Start and bind one Archboard workhorse transaction
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:37'
updated_date: '2026-08-31 17:50'
labels: []
dependencies:
  - TASK-143.01.05
  - TASK-143.01.07
  - TASK-143.01.08
  - TASK-143.01.09
  - TASK-143.01.20
  - TASK-143.05.03
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-workhorse-start
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 224000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own one serialized start-and-bind transaction for an Archboard-created workhorse using the literal reviewed ThreadStartParams profile. It verifies the returned thread itself and compensates only a newly created, confirmed, idle root; it never selects or deletes by recency. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The exact ThreadStartParams included fields and intentional omissions match the authored workhorse profile: checkout cwd/sole runtime root, paginated persistence, startup/archboard source, instructions, eager tools, inherited provider/model/approval/sandbox/environment policy, and disabled raw events.
- [ ] #2 The transaction stages one thread/start, verifies returned ThreadId/cwd/root/history/source/threadSource/model/provider/tier plus start-response approvalPolicy, approvalsReviewer, sandbox, and activePermissionProfile, then commits provenance/hashes and binds exactly once.
- [ ] #3 Before confirmed start, failure rolls back locally. After confirmed start but failed bind, delete is allowed only after re-reading that new idle root; failed/lost delete becomes inspect_only.
- [ ] #4 A lost thread/start response is outcome_unknown, never retried, inferred, or cleaned up; every staged/confirmed/bind/cleanup boundary is tested.
- [ ] #5 Every staged thread-start, bind, cleanup, and initial operation correlation uses the shared canonical OperationId authority; this module does not mint strings or reuse another identity domain.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define the exact reviewed workhorse thread/start profile and typed start/bind lifecycle contract using only public session, epoch, thread-link, authored-instruction, tool-manifest, and operation-identity ports. 2. Implement one serialized start transaction: mint canonical operation identity, stage, call thread/start once, validate the full response, commit durable provenance, and bind exactly once. 3. Implement fail-closed settlement: local rollback before confirmation; outcome_unknown with no retry on lost/invalid/uncertain start; exact idle-root reread plus one cleanup transaction only after a confirmed start and failed bind, with inspect_only on cleanup uncertainty. 4. Add focused tests for profile omissions, serialization, staging/confirmation/bind boundaries, unknown outcomes, exact cleanup guard, and operation identity correlation. 5. Run focused tests and proportional type/lint/format validation, then report READY_FOR_REVIEW without finalizing the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the serialized workhorse start-and-bind transaction in src/runtime/codex-workhorse-start with the literal reviewed profile, canonical OperationId issuance, typed response/provenance validation, fail-closed rollback/outcome_unknown handling, exact idle-root cleanup, and focused lifecycle/profile tests. Validation: focused suite 12 pass / 77 expectations; bun run type-check passes for both projects; full Oxlint passes with 0 warnings/errors; scoped Oxfmt passes; git diff --check passes. Task remains In Progress with acceptance criteria unchecked pending independent review.
<!-- SECTION:NOTES:END -->

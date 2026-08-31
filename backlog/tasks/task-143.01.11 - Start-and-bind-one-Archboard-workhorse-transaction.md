---
id: TASK-143.01.11
title: Start and bind one Archboard workhorse transaction
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:37'
updated_date: '2026-08-31 18:19'
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
- [x] #1 The exact ThreadStartParams included fields and intentional omissions match the authored workhorse profile: checkout cwd/sole runtime root, paginated persistence, startup/archboard source, instructions, eager tools, inherited provider/model/approval/sandbox/environment policy, and disabled raw events.
- [x] #2 The transaction stages one thread/start, verifies returned ThreadId/cwd/root/history/source/threadSource/model/provider/tier plus start-response approvalPolicy, approvalsReviewer, sandbox, and activePermissionProfile, then commits provenance/hashes and binds exactly once.
- [x] #3 Before confirmed start, failure rolls back locally. After confirmed start but failed bind, delete is allowed only after re-reading that new idle root; failed/lost delete becomes inspect_only.
- [x] #4 A lost thread/start response is outcome_unknown, never retried, inferred, or cleaned up; every staged/confirmed/bind/cleanup boundary is tested.
- [x] #5 Every staged thread-start, bind, cleanup, and initial operation correlation uses the shared canonical OperationId authority; this module does not mint strings or reuse another identity domain.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define the exact reviewed workhorse thread/start profile and typed start/bind lifecycle contract using only public session, epoch, thread-link, authored-instruction, tool-manifest, and operation-identity ports. 2. Implement one serialized start transaction: mint canonical operation identity, stage, call thread/start once, validate the full response, commit durable provenance, and bind exactly once. 3. Implement fail-closed settlement: local rollback before confirmation; outcome_unknown with no retry on lost/invalid/uncertain start; exact idle-root reread plus one cleanup transaction only after a confirmed start and failed bind, with inspect_only on cleanup uncertainty. 4. Add focused tests for profile omissions, serialization, staging/confirmation/bind boundaries, unknown outcomes, exact cleanup guard, and operation identity correlation. 5. Run focused tests and proportional type/lint/format validation, then report READY_FOR_REVIEW without finalizing the task.

6. Remediate review findings by rereading cleanup threads with turns included, refusing nonempty idle roots, and deep-cloning/deep-freezing retained facts and snapshots with mutation-sensitive tests, then rerun capped review validation and report READY_FOR_REVIEW without finalizing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the serialized workhorse start-and-bind transaction in src/runtime/codex-workhorse-start with the literal reviewed profile, canonical OperationId issuance, typed response/provenance validation, fail-closed rollback/outcome_unknown handling, exact idle-root cleanup, and focused lifecycle/profile tests. Validation: focused suite 12 pass / 77 expectations; bun run type-check passes for both projects; full Oxlint passes with 0 warnings/errors; scoped Oxfmt passes; git diff --check passes. Task remains In Progress with acceptance criteria unchecked pending independent review.

Remediated independent review findings: cleanup rereads thread turns with includeTurns=true and refuses idle roots containing turns; retained response facts, snapshots, bindings, CAS/link graphs, and binding provenance are cloned and recursively frozen. Added mutation-sensitive ready and inspect-only cleanup tests. Capped validation rerun sequentially in named systemd user services: focused 15 pass / 133 expectations, type-check success, Oxlint 0 warnings/errors, Oxfmt clean, repository inventory 39 pass / 69 expectations. Task remains In Progress with acceptance criteria unchecked pending rereview.

Finalization evidence for clean range 8521dd6d9e9e5e21532651b9127d55167b0a2ebd..0081cb4cc6fa53e0e4f46d762e5c71d86e445a23: AC1 is proven by profile.test.ts exact field-order, omission, and hash assertions. AC2 is proven by lifecycle.test.ts happy-path stage/confirm/bind assertions plus response facts and durable provenance checks. AC3 is proven by not-delivered rollback, full-turn exact idle-root reread, nonempty-idle refusal, and cleanup failure-boundary tests. AC4 is proven by the lost-start no-retry/no-inference/no-cleanup test and cleanup settlement tests. AC5 is proven by canonical OperationId correlation, binding provenance, and distinct cleanup-operation assertions. Independent review marked the fixed range REVIEW_CLEAN. Final capped validation: focused 15 pass / 133 expectations; both-project type-check success; Oxlint 0 warnings/errors; Oxfmt clean; inventory 39 pass / 69 expectations; git diff --check passes. Known combined boundaries/module-scope/repository/browser OOM lanes were intentionally not rerun. Protected bundle hash remains unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented and independently reviewed the serialized Archboard workhorse start-and-bind transaction, including the exact reviewed profile, canonical operation correlation, fail-closed settlement, full-turn idle-root cleanup guard, and deeply immutable retained snapshots. All five acceptance criteria are checked from direct clean-range evidence; focused tests, typecheck, lint, format, inventory, and diff checks pass. Known combined OOM lanes were intentionally not rerun.
<!-- SECTION:FINAL_SUMMARY:END -->

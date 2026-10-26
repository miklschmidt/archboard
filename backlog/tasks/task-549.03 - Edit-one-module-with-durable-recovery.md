---
id: TASK-549.03
title: Edit one module with durable recovery
status: In Progress
assignee:
  - '@codex-backend'
created_date: '2026-10-26T05:24:00Z'
updated_date: '2026-10-26T12:23:00Z'
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
ordinal: 933000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 3.

## What to build

A lost response or interrupted write must not leave readers with mixed architecture files.

An agent changes a module description through the shared operation interface. The CLI and server return the same durable outcome and recovery information.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.02
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An agent changes a module description through the shared operation interface. The CLI and server return the same durable outcome and recovery information.
- [ ] #2 Include an explicit target, expected read token, operation ID, writer, doing line, and subject claim. Claim visibility and take-back work in the browser.
- [x] #3 Use the complete journal and installation contract for this narrow edit. Signing failure changes no current files. Interrupted installation resumes or reports preserved foreign content.
- [x] #4 Repeating a completed request returns its recorded result. Reusing its operation ID for another request fails. Readers never receive a mixed installation.
- [ ] #5 Stable external edits refresh readers without inventing adoption. Invalid or changing files block writes and mark an old scene stale.
- [ ] #6 Journals remain checkout-specific. Branch changes block unsafe recovery. Notifications follow durable completion, and reconnection obtains a fresh coherent read.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused tests pass at the agreed public runtime or browser seam.
- [ ] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Preserve the original task drafts and create TASK-549.03 integration drafts on Board persistence, Command interface, and Archboard server routes from the adopted refactored readings. Keep every retained subject identity.
2. Deliver one explicit claimed description edit through the shared architecture runtime, CLI and HTTP, with the existing current-read success schema.
3. Prepare checkpoint and archive-join signatures before installation. Use a checkout-private durable journal, exact images, complete read tokens, conditional archive completion, safe retries and recovery.
4. Expose fresh coherent event snapshots, completion and external-change news, visible claim data and explicit take-back. Keep every browser component and browser test with the parent.
5. Preserve signed backup/task-549.03-before-main-refactor, transplant only own commits after a60b0980eca566a0aedcf664544ec598be67ef03 onto new integration 56d468883, and merge the adopted integration follow-up normally. Adapt the relocated clients, process Git API and timing groups.
6. Simplify, run focused public-boundary tests, lint, both type projects, formatting and draft checks. Record the unchanged board interface-width gate for TASK-549.24. Save the backend handoff, release claims, stop the server, commit signed checkpoints, and keep the mixed ticket In Progress.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The backend now edits one claimed description through the public runtime, CLI and HTTP contracts. Exact reads keep their schema and synchronous signature. Runtime cases cover retry identity, retained results, visible claim data, take-back, coherent news, foreign inputs and real interruption recovery. A cleanup retry regression exposed a missing-ref deletion bug and now passes. Browser work remains parent-owned. Detailed evidence remains in task-549.03-evidence outside the repository.

Signed preparation now includes any archive synchronization before current-file changes. A real two-worktree regression first proved that late synchronization signing changed current bytes on refusal, then passed after the append split into signed preparation and conditional installation. The final runtime regression command passes 42 tests across six files. Recovery cuts use real process exits and real files/Git objects. A later test-only simplification advances the parent clock after the child dies, so the same 12 recovery cases pass without waiting for each dead lease. CLI/HTTP, source claim behavior, skill inputs and lock regressions pass 41 tests across 13 owners. Public contract notes are in task-549.03-contract.md. The parent now owns the origin/main integration update. Per the owner instruction, this branch retains exact old base a60b0980eca566a0aedcf664544ec598be67ef03 and will not merge or rebase until the parent supplies its updated base.

The parent completed the integration update onto origin/main 6cae688bbaa2b6c9862054258e89f28c605cfc46. The supplied integration base is 56d46888390de7969ceb42d964437b35e9e7c885. Save and sign this ticket work, create a backup ref, and transplant only commits after exact old base a60b0980eca566a0aedcf664544ec598be67ef03 with signed rebase --onto. Do not merge old integration ancestry. Adapt the moved CLI clients, invocation context and Git process API, then rerun affected checks. Parent retains frontend ownership and later architecture adoption.

The signed --onto transplant is complete. backup/task-549.03-before-main-refactor retains exact source 86f03ab1c. New source history excludes old integration a60b0980e. Signed merge 2cfbd91ab includes adopted follow-up 8af747543. CLI model clients now use their app-owned architecture-model.ts, statedInvocation().doing and @archboard/process/git. Removed lifecycle exports remain removed, and RequestFailure stays private. Locked dependencies were reinstalled without lockfile changes. Both type projects pass. The rebased runtime command passes 48 tests across seven owners. Rebased CLI/HTTP, skills and lock contracts pass 41 tests across 13 owners. The original task drafts stay intact. TASK-549.03 integration drafts derive from the adopted current readings and restore the same subject IDs through the CLI. No browser code or browser tests changed. Canonical read ADR references now name ADR 0060. The width test remains unchanged: board exports 234 names against 188, from the parent-reported baseline 209. Owner-directed superseded API retirement remains TASK-549.24. Workspace stays within its ceiling because private state records use the existing atomic write operation to create durable parent directories.

Recovery refusals now expose the operation, retained checkpoint, progress, affected identities, fingerprints, and original branch and HEAD without private paths or logged bytes. The new public-runtime assertion failed before this projection and then passed, including an exact read of the retained candidate while current inputs remain blocked. Edit and recovery failures state applied false or unknown plus reconciliation false. Source and browser types pass. Full lint passes with zero warnings. Final adapter checks pass 21 tests across five owners, with another 20 passing across eight contract and lock owners. One broad runtime run passed 38 tests but four real-Git owners exceeded their default five-second timeout under load. Preserve that evidence and rerun with an explicit command timeout before accepting the slice. Delivery architecture checks retain zero semantics diagnostics and no warning on the three affected boards. Ten unrelated code warnings remain.

Backend completion evidence: the accepted public-runtime command passes 48 tests across seven files with --timeout 15000. It covers all 19 new description, claim/news, exclusion and recovery cases, plus the existing 12 canonical-read, 11 checkpoint and six inventory cases. The earlier default-timeout run remains recorded with 38 pass and four timeouts. Final CLI/HTTP, skills, schema/help and legacy lock commands pass 41 tests across 13 files. The executable README fixture returns an identical retry result, changes only gateway.module.json, verifies its configured checkpoint signature, and ends with no claim. The fixture registrations are forgotten and this checkout server is stopped. All integration variants, adoption and shelving records match baf552fde, and the original TASK-549.03 drafts match the signed backup exactly. The new integration drafts preserve all task-added subject IDs. The delivery semantics check reports zero diagnostics. The code check reports ten unrelated warnings, none on the three touched boards. The unchanged package API/width gate reports 68 pass and one failure: board has 234 names against 188. Owner-directed retirement remains TASK-549.24. Acceptance criteria 1, 3 and 4 and the runtime-test definition item are proven. Criteria 2, 5 and 6 and final architecture/browser closure remain for the parent. Keep this ticket In Progress. The final source pointer, APIs, exact evidence, fixture instructions and limitations will be in task-549.03-backend.md outside the repository.

A final real-process regression found that an already completed request returned MODEL_BUSY while another process held its cleanup lease. The new reference-transaction hook pauses real cleanup after durable completion. 14-red.log records that refusal. The runtime now returns the retained applied success with pending cleanup in that case, and 14-green.log passes both exclusion owners. The completed checkpoint and original request remain identical after the other cleaner releases its lease. The final complete focused runtime command will include this twentieth edit/recovery case. The public schemas and event shapes remain unchanged.
<!-- SECTION:NOTES:END -->

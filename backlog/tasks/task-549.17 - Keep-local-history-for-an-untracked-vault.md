---
id: TASK-549.17
title: Keep local history for an untracked vault
status: Done
assignee:
  - '@codex-local-history'
created_date: '2026-10-26T05:26:00Z'
updated_date: '2026-10-26T16:47:00Z'
labels:
  - ready-for-agent
dependencies:
  - TASK-549.03
references:
  - TASK-549
documentation:
  - docs/design/canonical-module-tickets.md
  - docs/design/architecture-discovery-and-interaction.md
parent_task_id: TASK-549
priority: high
type: feature
ordinal: 947000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Parent

TASK-549. Approved delivery slice 17.

## What to build

Architecture work outside a source repository still needs durable local history.

An owner explicitly initializes a private bare archive for a vault outside a source repository. Existing model operations then retain and reopen its history.

TASK-549 supplies the complete behavioral contracts and out-of-scope limits. Existing vaults keep their legacy authority until explicit migration.

The user approved real temporary files and Git repositories through the shared architecture read/write interface. Use the existing browser seam for visible behavior.

## Blocked by

TASK-549.03
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An owner explicitly initializes a private bare archive for a vault outside a source repository. Existing model operations then retain and reopen its history.
- [x] #2 Initialization never creates or changes a source repository. The vault remains local-only until an explicit publication destination exists.
- [x] #3 The same signing, recovery, and diagnostic contracts apply. Published architecture contains no private machine paths.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused tests pass at the agreed public runtime or browser seam.
- [x] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm b5be713977e7829f16b404314af9fd8f653f70be and the approved runtime seam. Read shared archive, durable edit, publication, and policy owners.
2. Create Board persistence@TASK-549.17, Command interface@TASK-549.17, and Archboard server routes@TASK-549.17 through CLI claims and doing lines. Record the early contract outside the repo.
3. Add explicit private bare archive initialization outside source repositories. Resolve both archive locations through the same private archive interface and retain checkout-specific transaction ownership.
4. Use short red-green runtime slices with real files and Git for initialization, retain/reopen, durable edit/recovery, signing, isolation, and local-only publication. Add thin CLI/HTTP translations.
5. Update ADR 0059, consumer instructions, examples, evaluation coverage, and architecture proposals. Run focused runtime/adapter tests, types, lint, and formatting. Preserve the 241/188 width gate and unrelated baseline findings.
6. Merge the latest integration into this branch, simplify the result, finalize proven criteria, adopt affected proposals, release claims, stop the server, and deliver signed commits with exact evidence.

7. Required merger: synchronize integration 1dba8fd12 into this source, preserve both authored histories and frontend bytes, and restate both delivered meanings on combined proposals. Test structural batches with source/private history and publication/recovery. Diagnose the inherited shallow-fetch timeout without deadline changes. Adopt, release claims, stop the server, and supply signed integration evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner approved full graph and public runtime tests with real temporary files and Git. This task adds repository-independent durable history for untracked-vault owners through the existing archive, installation, and publication engine. No frontend changes, child agents, review, push, PR action, or real external publication are authorized in this implementation slice.

Public runtime slices prove explicit bare initialization, source preservation, exact retention/reopen, signing refusal, signed private edits, explicit temporary-local publication/fetch, and interrupted edit recovery. Red evidence caught private journal lookup after a new source repository appeared; lookup now stays with private history. CLI/HTTP setup composition passes across restart. Three TASK-549.17 proposals exist, but their drawing edits are paused at parent direction after shared Git-owner fan-out. No further architecture CLI calls will run until the parent clears the pause. Shared runtime regressions and static gates are in progress.

Sequential architecture CLI read with explicit server URL passed after process pressure subsided. All three proposals now describe delivered source. Lint and both type projects pass. Width remains 243/188 with exactly two new public names and no ceiling changes. One existing shallow-fetch case exceeded its 15-second timeout while the broad runtime group overlapped the code scan. It will rerun alone after that group finishes. Code evidence found two proposal issues, now corrected; ten unrelated baseline warnings remain outside the affected boards. S20 metadata errors remain at this baseline and are fixed in the separate .04 source awaiting integration.

The corrected private initialization test passes. Its prior failure came from a Bun assertion matcher replacing the archive path in the test result. The unchanged shallow archive fetch case times out alone both on this source and an exact git-archive copy of b5be713977e7829f16b404314af9fd8f653f70be, with the original 15-second limit. No timing policy or test limit changed. The broad run has 45 passes, the corrected initialization supplies its missing pass, and the one baseline fetch timeout remains documented. Sixteen consumer/schema/link/CLI-contract cases pass. Signed implementation checkpoint c08120a20364bd9e05969f36b7a07c1f3480a8c0 is recorded.

All three TASK-549.17 proposals are adopted after comparison and code evidence. Earlier variant contents, document references, decision history, and existing shared views remain exact. A new Private archive history view shows the one shared engine. Current semantics has zero diagnostics. The affected boards have zero code warnings; ten baseline warnings remain elsewhere. Static architecture pictures were rendered and inspected without frontend edits or browser tests. Synchronizing feat/canonical-module-model into this branch reports Already up to date at b5be713977e7829f16b404314af9fd8f653f70be. The final simplification returns setup information only from initialization, leaving publication evidence checkpoint-specific. No separate history or transaction implementation was added.

All three task claims are released and the worktree server is stopped. Final status reports running:false. The implementation used no child agents, frontend edits, browser tests, review phase, source push, PR action, integration-branch merge, other ticket implementation, or real external archive publication. Disposable local Git remotes own all publication evidence. The parent owns the 198-worktree registry repair in .04; this task used a one-checkout isolated registry after the pressure incident and did not copy that source.

Required merger starts from source a8837de0 and integration 1dba8fd12. Text conflicts retain both imports, examples, and guidance. Explicit architecture reconciliation keeps the later .04 current as the proposal base and retains .17 as historical with its original adoption. Original meanings, identities, decisions, and view expansions remain protected by recorded provenance.

Required merger closure: source synchronization e75ac98913 preserves integration 1dba8fd12 and original private-history source a8837de0. Both original variant families, identities, documents, adoption records, shelving records, and shared view expansions remain intact. Normal CLI proposals named TASK-549.17 integration now combine both implemented meanings and are adopted on Board persistence, Command interface, and Archboard server routes. The candidate-to-location contract is drawn explicitly. No frontend files or browser tests differ from integration. The .04 registry repair, S20 metadata repair, and completed .04 task remain exact. Final focused evidence covers 28 runtime cases, five CLI/HTTP cases, and 14 consumer/contract cases. Types, lint with zero warnings, formatting, evaluation inputs, and current semantics pass. All affected proposals have zero code warnings; ten unrelated baseline warnings remain. The inherited shallow-fetch timeout came from cumulative sequential Git probe overhead. Independent read-only probes now settle together, and explicit archive roots no longer query an unused tip. Final shallow runs pass at 13418ms and 12534ms under the unchanged 15000ms limit. The complete structural owner passes nine cases, with its former timeout at 12625ms. No deadline, assertion, type rule, lint rule, or width ceiling is weakened. Private structural signing, complete affected subjects, publication during interruption, source-context refusal, recovery, and durable retry pass through real files and Git. The simplification pause keeps one archive engine, one transaction, and the existing settlement helper. All three claims are released and the source server is stopped. The full gate remains open at width 243/188 under TASK-549.24. No child agent, frontend edit, browser run, fresh review, push, PR action, or unrelated ticket work occurs.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Explicit private bare archive initialization now supports untracked canonical vaults through the existing retention, edit, recovery, signing, and publication engine. The CLI and HTTP setup return the local archive directory for owner Git configuration. Initialization preserves source repositories and damaged storage. History remains local until an explicit configured exchange, and published fixture objects contain no generated private paths. Six focused runtime cases and the CLI/HTTP case pass. The shared regression run plus its corrected initialization case covers 46 passing runtime cases; one unchanged shallow-fetch case times out on both this source and the exact baseline. Sixteen consumer/contract cases, both type projects, lint with zero warnings, and formatting pass. The unchanged width ceiling reports 243/188 after two public additions and remains TASK-549.24 work. Existing S20 metadata errors remain at this baseline and the parent owns their separate .04 repair. ADR 0059, terminology, consumer guidance, example, evaluation coverage, and all affected proposals match the delivered behavior. No frontend handoff is required.

Required integration closure supersedes the baseline limits above: the S20 inputs pass after the preserved .04 repair, and the shallow-fetch case passes twice within its original deadline after bounded Git probe improvements. Source and private structural operations, publication, recovery, and adapter contracts pass. Both architecture histories remain exact, and combined proposals are adopted. TASK-549.17 and TASK-549.04 remain Done. TASK-549 remains In Progress, and the width gate remains TASK-549.24 work.
<!-- SECTION:FINAL_SUMMARY:END -->

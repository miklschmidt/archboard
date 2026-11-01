---
id: TASK-549.16
title: Publish archive history and recover missing revisions
status: Done
assignee:
  - '@codex-parent'
created_date: '2026-10-26T05:25:00Z'
updated_date: '2026-10-26T14:36:00Z'
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
- [x] #1 An owner explicitly publishes history to a configured remote and archive ref. A collaborator fetches a missing reading, including from a shallow clone.
- [x] #2 Distinguish saved-locally, publication-pending, published, and unavailable states. Normal code pushes never count as history publication.
- [x] #3 Stale publication fetches and joins archive ancestry without force-pushing or merging model content. Fetches include the complete referenced history.
- [x] #4 Publication setup establishes remote retention policy or reports its limitation. Network failure never reverses a completed local write.
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 Focused tests pass at the agreed public runtime or browser seam.
- [x] #2 Affected architecture descriptions, ADRs, and consumer instructions match the delivered behavior.
<!-- DOD:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm rebased ancestry and read the complete publication and recovery contracts.
2. Create Board persistence@TASK-549.16, Command interface@TASK-549.16, and Archboard server routes@TASK-549.16 proposals before code.
3. Publish a stable API/status contract outside the repository and implement one public-runtime TDD slice at a time with disposable signed repositories and bare remotes.
4. Add explicit configured publication, durable private status, complete history fetching, signed ancestry joins, retention limitations, and CLI/server adapters. Preserve current files, index, source HEAD, and exact identities.
5. Update consumer guidance, authored workflow examples, evaluation coverage, and ADR 0059. Run focused behavior owners and affected static gates.
6. Merge latest feat/canonical-module-model, resolve affected contracts, record parent UI work, release claims, stop this server, and leave signed checkpoints.

7. Parent browser delivery: keep publication status separate from immutable reading content. Add explicit destination configuration, publish, pending retry, and missing-history fetch for the selected exact checkpoint. Keep retention limits visible and refresh publication, checkpoint metadata, and the selected reading after accepted actions. Use the existing browser seam and real local bare remotes for the visible workflow. Align the browser proposal and adopt all delivery drafts after the complete slice passes.

8. Integrate TASK-549.03 before closure. Preserve exact edit receipts, publication metadata, live reading recovery, and every architecture record. Rebase the four publication proposals through ordinary CLI branches named TASK-549.16 integration, then retain the superseded drafts as shelved history.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Backend assignment only. Required base baf552fde042b363b79a41dfcfcbaca1ef3e81bd and main 6cae688bb are ancestors of the provided clean branch. TASK-549.03 is not integrated and will not be absorbed. Its private write journal and current-edit APIs remain outside this slice. Browser publication states remain parent-owned. No push, PR action, subagent, or real repository archive publication is authorized.

Created task drafts on Board persistence, Command interface, and Archboard server routes before code. The early public contract is task-549.16-contract.md in the shared orchestration directory. First red test failed on the missing public status export. First green test passed through the public runtime with a signed disposable repository and local bare remote. Explicit publication persists evidence and preserves dirty index, current files, and source HEAD. Normal code publication does not create archive evidence.

Complete archive fetch passes for both a shallow source clone and an already truncated archive clone. Source HEAD, dirty index, authored current state, source fetch mapping, and the unrelated source shallow boundary remain unchanged. A red stale-push case became green through complete fetch plus a signed synchronization commit with both exact checkpoint parents. No force-push or semantic merge occurs. Initial source types identified one unused import, which was removed. The first composed shallow test exceeded the 15-second default because repeated exact reads duplicated Git probes; the runtime now reuses its returned reading and avoids those repeated probes.

Signed checkpoint cc9abce77 saves explicit publication and durable local status. Subsequent runtime cases prove complete fetching, signed stale-archive joins, signing refusal, private common-directory ownership across linked worktrees, changed-URL refusal without blocking local reads, complete pending-baseline status, and missing-identity diagnostics. CLI/server configuration, publish, fetch, and status adapters pass through the shared schemas, including a server restart. Publication metadata uses a separate private sidecar and receipt refs. It does not reuse or replace TASK-549.03 current-edit recovery.

Backend delivery evidence: 32 tests pass across six isolated runtime owners. Twelve more tests pass across the CLI/HTTP process owner, CLI contract rendering, and deterministic consumer artifacts. The final missing-reading status case also passes and exposes the configured destination for recovery. Both TypeScript projects pass. Full lint passes with zero warnings, and the final changed runtime files pass focused type-aware lint. Formatting and current vault semantics pass. All three task proposals compare successfully and have zero code warnings. Ten existing warnings remain on Archboard, Archboard server, and Live panes. The unchanged interface-width gate reports board 216/188; TASK-549.24 owns removal of transitional legacy exports, and no ceiling or lint rule changed.

Final simplification: one atomic destination sidecar belongs to the Git common directory per portable vault path. Private pending refs retain the intended archive tip before network work, and immutable published receipt refs retain acknowledged closures. The runtime derives baseline status from Git ancestry. The fetch owner removes temporary incoming refs after use. No current-edit journal or model copy is introduced. A normal named fetch runs first and only an observed archive shallow boundary triggers deeper fetching. Configured signing governs every join. A foreign source branch is refused without changing that remote branch. Publication refuses machine-local source paths without rewriting checkpoint identities.

Failure record: the first combined multi-file test command omitted this repository standard --isolate flag. Bun reset later case timeouts to five seconds and fixture cleanup produced dangling asynchronous errors. The corrected isolated owner run passes all 32 tests without changing global timing policy. Red/green logs record the missing exports, network status, truncated archive, stale push, missing history catalogue, changed destination, pending baseline closure, private source path, missing identity, source-ref refusal, and missing-reading destination. All logs are under /home/msc/.local/state/archboard-implementation/task-549/task-549.16-evidence. Model evaluations and browser tests did not run in this backend assignment.

Parent browser checkpoint: exact readings show separately queried publication status, explicit remote/ref configuration, retention limits, and publish/fetch controls. The initial browser test failed before the surface existed and passes after explicit configuration and publication, with four assertions and the same selected checkpoint. Source and browser types pass. Three form lint findings are corrected. Publication receives a separate browser owner because combining this work with TASK-549.03 exceeds the existing file limit; both owners share interaction helpers. Pending failure/retry and missing-history recovery remain in progress.

The publication browser owner passes network failure, pending retry, and missing-history fetch with nine assertions. It preserves the selected checkpoint and never substitutes current content. Signed merge c3aca3c46 combines the integrated durable-edit slice with publication. A public-runtime regression now covers immutable edit receipts after publication, while the viewer reads mutable sharing evidence separately. Both source histories retain exact variant meanings, views, adoptions, and shelvings. Existing current variants become historical through the integration adoption records.

Complete delivery: nine browser cases and 53 assertions pass across publication, current/historical readings, and legacy workspace navigation. Twenty-three combined runtime tests and four CLI/HTTP adapter tests pass. Fifteen consumer artifact tests pass. Source/frontend types, lint with zero warnings, and formatting pass after removing one unused helper import. Parent inspected pending/recovered browser captures and all affected architecture comparisons. The four TASK-549.16 integration proposals are adopted. A final persistence overview proposal groups publication storage under canonical architecture and extends the existing checkpoint view; current semantics now has zero diagnostics. Affected boards have zero code warnings, with ten unrelated warnings elsewhere. The unchanged board interface-width gate is 241/188, explicitly owned by TASK-549.24. All original variant meanings and decision records survive. No model evaluation, push, or PR action ran.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Owners explicitly configure, publish, and fetch retained architecture through the shared runtime, CLI, HTTP API, and local browser. Durable status distinguishes local, pending, published, and unavailable history. The browser supports retry and exact missing-history recovery without substituting current architecture. Signed archive joins and complete fetches preserve history independently of current files. Remote retention limits stay visible. Publication refreshes read metadata while completed edit receipts remain unchanged. Focused browser, runtime, adapter, consumer, type, lint, formatting, and semantic checks pass. TASK-549.24 still owns the unchanged interface-width gate. Four delivery proposals and the persistence overview correction are adopted.
<!-- SECTION:FINAL_SUMMARY:END -->

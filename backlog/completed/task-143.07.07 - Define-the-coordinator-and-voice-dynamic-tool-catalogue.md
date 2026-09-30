---
id: TASK-143.07.07
title: Define the coordinator and voice dynamic-tool catalogue
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:37'
updated_date: '2026-08-31 02:53'
labels: []
dependencies:
  - TASK-143.01.02
  - TASK-143.01.03
  - TASK-143.01.07
  - TASK-143.01.17
references:
  - docs/design/codex-workbench-authored-contracts.md
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-coordinator-tool-contract
parent_task_id: TASK-143.07
priority: high
type: task
ordinal: 231000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Load and validate the reviewed eager archboard_workhorse and archboard_voice namespace manifests/result schemas. It authors no text and dispatches no effect. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The catalogue uses the frozen tool names, descriptions, schemas, and coordinator identity; queue operations are exactly add, list, update, delete, reorder, and start, with no synthetic revision field.
- [x] #2 Every entry declares authority target, caller role, required links, success result, and typed refusal/error set; operation-dependent queue fields match exact 0.151.0 params.
- [x] #3 Snapshot tests reject manifest drift, extra/missing tools, nonexistent queue operations, ambiguous descriptions, and catalogue definitions outside this owner.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the reviewed archboard_workhorse and archboard_voice manifests, exact Codex 0.151.0 queue params, and coordinator identity contract. 2. Implement one codex-coordinator-tool-contract catalogue owner with frozen names, descriptions, schemas, authority, caller, link, outcome, refusal, and error metadata and no effect dispatch. 3. Add independent snapshots and negative controls for drift, missing/extra tools, invalid queue operations, ambiguous prose, revision invention, and definitions outside the owner. 4. Run focused, module, repository, type, lint, format, diff, and clean-status gates; record evidence for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved immediately after TASK-143.01.07 finalized at integration HEAD d890552. This dependency-ready leaf owns only src/runtime/codex-coordinator-tool-contract and is path-disjoint from every active implementation.

Implementation commit 97a6407 defines the byte-checked archboard_workhorse and archboard_voice manifests, frozen coordinator metadata/result contracts, canonical response envelopes, and exact Codex 0.151.0 queue operation/parameter schemas under src/runtime/codex-coordinator-tool-contract. Focused validation passed: 11 catalogue tests / 1,048 assertions; bun run type-check; bun run lint; bun run fmt:check; targeted oxfmt and oxlint; git diff --check. The tests independently snapshot manifest bytes and names, reject missing/extra/reordered/ambiguous tools and invented queue fields, enforce one canonical inputText envelope, validate success=false refusal semantics, verify authority/link/result/refusal metadata, freeze inputs, and reject namespace definitions outside the owner. Manifest digests remain fe8dd9bfaf91b37cbae31136ccdfc4eb1106728b40d2bc3ea01036606d6f748f and 792d6ec96edc2fbffc8400ce0d1304a56662bee5436e95914505cb848356c393. Module/system/repository/browser lanes were not run because the parent task supplied a capped-run constraint after the global OOM; parent review must run those lanes under the capped runner before finalization. No unrelated files, including the protected src-DlBR1tz.js, were changed.

Reviewer remediation implementation commit 3f76b7d corrects the reviewed frozen queue order to list, add, update, delete, reorder, start in both the production catalogue and independent fixture. It splits valid dynamic-tool responses (success:true) from pre-call unknown refusal responses (success:false), preserving one canonical inputText item and adding hostile not_ready plus success:false rejection alongside unknown invalid_call plus success:false coverage. Structural TS/TSX/JSON ownership detection now inspects object shape and parsed JSON rather than raw substrings, with fake TS/JSON duplicate, import-only, prose, and real-tree single-owner controls. Focused validation passed: 12 catalogue tests / 1,058 assertions; bunx tsc --noEmit; bunx oxlint src/runtime/codex-coordinator-tool-contract; bunx oxfmt --check src/runtime/codex-coordinator-tool-contract; bun run type-check; bun run lint; bun run fmt:check; git diff --check. Manifest bytes, hashes, reviewed metadata, and protected unrelated files remain unchanged. Broad module/repository/system/browser lanes remain intentionally unrun under the parent capped-run constraint; task remains In Progress and acceptance criteria remain unchecked.

Independent same-reviewer rereview returned REVIEW_CLEAN for 317d3aca9c82e4f13242def9040a1aa5ffb0f07c..9be4ee6f672f869767cc64387aaa7b00a0b9dd74. Root validation passed in capped unit archboard-task1430707-focused-6220ca2.service (12 tests, 1,058 expectations, 57.2 MB peak, 0 swap, 6 GB/1 GB caps) and capped integration unit archboard-integration-modules-6220ca2.service (1,296 tests, 12,673 expectations, 1,018.6 MB peak, 0 swap, 12 GB/2 GB caps); neither cap was hit.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Defined the frozen workhorse and voice coordinator catalogues, exact queue schemas and order, typed response/refusal boundaries, and structural single-owner enforcement. Same-reviewer remediation review and capped focused plus full module validation passed.
<!-- SECTION:FINAL_SUMMARY:END -->

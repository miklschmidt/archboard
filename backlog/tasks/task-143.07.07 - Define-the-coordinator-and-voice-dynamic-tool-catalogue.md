---
id: TASK-143.07.07
title: Define the coordinator and voice dynamic-tool catalogue
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:37'
updated_date: '2026-08-31 02:31'
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
- [ ] #1 The catalogue uses the frozen tool names, descriptions, schemas, and coordinator identity; queue operations are exactly add, list, update, delete, reorder, and start, with no synthetic revision field.
- [ ] #2 Every entry declares authority target, caller role, required links, success result, and typed refusal/error set; operation-dependent queue fields match exact 0.151.0 params.
- [ ] #3 Snapshot tests reject manifest drift, extra/missing tools, nonexistent queue operations, ambiguous descriptions, and catalogue definitions outside this owner.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the reviewed archboard_workhorse and archboard_voice manifests, exact Codex 0.151.0 queue params, and coordinator identity contract. 2. Implement one codex-coordinator-tool-contract catalogue owner with frozen names, descriptions, schemas, authority, caller, link, outcome, refusal, and error metadata and no effect dispatch. 3. Add independent snapshots and negative controls for drift, missing/extra tools, invalid queue operations, ambiguous prose, revision invention, and definitions outside the owner. 4. Run focused, module, repository, type, lint, format, diff, and clean-status gates; record evidence for independent review.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved immediately after TASK-143.01.07 finalized at integration HEAD d890552. This dependency-ready leaf owns only src/runtime/codex-coordinator-tool-contract and is path-disjoint from every active implementation.

Implementation commit 97a6407 defines the byte-checked archboard_workhorse and archboard_voice manifests, frozen coordinator metadata/result contracts, canonical response envelopes, and exact Codex 0.151.0 queue operation/parameter schemas under src/runtime/codex-coordinator-tool-contract. Focused validation passed: 11 catalogue tests / 1,048 assertions; bun run type-check; bun run lint; bun run fmt:check; targeted oxfmt and oxlint; git diff --check. The tests independently snapshot manifest bytes and names, reject missing/extra/reordered/ambiguous tools and invented queue fields, enforce one canonical inputText envelope, validate success=false refusal semantics, verify authority/link/result/refusal metadata, freeze inputs, and reject namespace definitions outside the owner. Manifest digests remain fe8dd9bfaf91b37cbae31136ccdfc4eb1106728b40d2bc3ea01036606d6f748f and 792d6ec96edc2fbffc8400ce0d1304a56662bee5436e95914505cb848356c393. Module/system/repository/browser lanes were not run because the parent task supplied a capped-run constraint after the global OOM; parent review must run those lanes under the capped runner before finalization. No unrelated files, including the protected src-DlBR1tz.js, were changed.
<!-- SECTION:NOTES:END -->

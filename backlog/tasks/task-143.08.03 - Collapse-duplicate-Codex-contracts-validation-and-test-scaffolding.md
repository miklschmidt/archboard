---
id: TASK-143.08.03
title: 'Collapse duplicate Codex contracts, validation, and test scaffolding'
status: Done
assignee:
  - '@codex'
created_date: '2026-09-02 01:36'
updated_date: '2026-09-03 03:15'
labels: []
dependencies:
  - TASK-143.08.02
references:
  - docs/agents/boundaries.md
  - src/runtime/codex-protocol
  - src/shared/codex-browser-model
  - src/ui/workbench-runtime/tests
  - tests/system/repository-policy
parent_task_id: TASK-143.08
priority: high
type: task
ordinal: 261000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deepen the recovered Codex protocol and browser modules after generated types become authoritative. Remove parallel literal sets, schemas, validation passes, hashes, identity records, error shells, and tests that restate tools, documentation, or each other. Preserve the genuinely useful transport, epoch, gateway recovery, approval broker, thread-link classifier, realtime adapter, media-session, and browser-lane behavior. Centralize only semantically identical code; do not create generic core, utils, misc, migration, or compatibility buckets.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ThreadStatus, TurnStatus, approval decisions, server-request methods, turn/start, turn/steer, thread/fork, thread/inject_items, queue params, call identity, and effect hashing each have one authoritative owner derived from TASK-143.08.02.
- [x] #2 One app-server ingress validation and one browser ingress validation protect untrusted data; sequenced deltas validate changed fields only, and the browser does not reparse the complete merged snapshot after each delta.
- [x] #3 Before deleting tests, a retained-owner matrix maps each reachable success, progress, empty, partial, failure, and recovery behavior to one module, process, or browser owner. Duplicate reload, shutdown, exit-race, approval, remediation, state-matrix, and submission-fencing cases are removed or folded into that owner.
- [x] #4 The Tailwind, Oxfmt, TypeScript-alias, Oxlint-alias, and authored-contract scaffolding that tests tool resolution, fixture cleanup, or copied prose is removed. The real Vite production build, frontend style entry, normal formatter and linter commands, opener browser workflow, module boundaries, and one stable ownership check remain.
- [x] #5 Only identical call identity, effect hash, error construction, child/session fake, socket fake, or deep-freeze behavior is shared. Differently constrained isRecord, boundedText, and lifecycle helpers stay local unless the deletion test proves one module owns the same semantics.
- [x] #6 The resulting production and test tree has fewer concepts, validation passes, cases, and lines than ba1aacee, with focused and broad checks proving retained behavior and no weakened rule, timeout, assertion, or browser gate.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make src/shared/codex-app-server-contract the sole generated-derived owner of Codex method sets and wire status/decision views; remove production literal copies while keeping app-server runtime decoding in codex-protocol and local browser projections in codex-browser-model.
2. Delete the unused server-side browser sequence parser and change the live UI transport to validate each untrusted delta field once, then merge the already parsed delta without reparsing the complete snapshot. Retain full validation for initial and recovery snapshots.
3. Apply the retained-owner matrix recorded in implementation notes. Delete duplicate reload, shutdown, exit-race, approval, remediation, state-matrix, submission-fencing, Tailwind compiler, Oxlint alias, copied authored-contract, fixture-cleanup, and tool-resolution owners; fold any unique reachable product assertion into the retained module owner before removal.
4. Share only implementations proven byte-for-byte or behaviorally identical. Prefer deletion and direct generated-derived types over adapters; keep distinct bounded text, record predicates, and lifecycle helpers local. Do not edit active-owner paths from TASK-143.06.06 or TASK-143.08.06.01.
5. Run focused retained owners, both contained TypeScript graphs, focused lint/format, the real Vite production build, and the smallest bounded repository/module evidence needed. Record before/after concepts, validation passes, cases, and lines; commit coherent slices and leave finalization to the parent.

6. Repair standards-review gaps without restoring standalone suites: expose browser snapshot relationship validation for post-merge deltas; fold unique shutdown schedules into retained transport/adversarial tests; fold transport-replacement and readiness rendering tables into mounted-runtime; restore the discriminated dynamic-effect boundary; correct tracked-file metrics; run only affected owners and commit the repair.

7. Rereview repair: extract the existing workbench FakeSocket test fixture into typed support, then restore the three unique handshake, duplicate-sequence, and incompatible-refresh assertions without exceeding the 500-line owner limit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Pre-change audit at exact base a5146446a07efc127a2c02930f90bbaf64ab8560: dependency TASK-143.08.02 is Done; checkout is tracked-clean and detached at the requested commit. ba1aacee has 260,645 authored src/tests/scripts/tools lines, 1,687 test()/it() cases, and 259 production .parse/.safeParse call sites. The current base has 226,542 lines, 1,626 cases, and 261 production parse sites. Two reachable delta paths still reparse a complete merged BrowserSnapshot after validating changed fields. Nineteen production files define or repeat one of the audited status, decision, method, queue, call-identity, or effect-hash concepts.

Retained-owner matrix before deletion:
- App-server success and empty responses: src/runtime/codex-session/tests/response-workflows.test.ts through the codex-session interface.
- App-server progress notifications and malformed/failure ingress: src/runtime/codex-protocol/tests/protocol.test.ts through decodeServerNotification/decodeServerRequest/decodeResponse.
- Transport partial writes, late responses, and shutdown recovery: src/runtime/codex-transport/tests/transport.test.ts plus cleanup.test.ts only where process/write ownership differs.
- Ordinary approval success, refusal, expiry, and disconnect recovery: src/runtime/codex-approvals/tests/broker.test.ts through the broker interface.
- Dynamic approval identity, effect hash, replay refusal, and terminal recovery: src/shared/codex-browser-model/tests/dynamic.test.ts for browser contract and src/runtime/codex-dynamic-tools/tests/dispatch.test.ts for execution.
- Gateway snapshot success, empty projection, partial sequenced delta, gap, and recovery: src/ui/workbench-transport/tests/transport.test.ts through the live browser ingress.
- Read-only/executable timeline progress, empty history, unsupported partial item, mapping failure, and recovery presentation: src/ui/workbench-runtime/tests/runtime.test.ts.
- Process startup/shutdown and child exit behavior remains owned by TASK-143.08.04 and its process-contract owners; .08.03 deletes only duplicate module-level simulations outside active TASK-143.06.06 paths.
- Real browser opener behavior remains tests/system/browser/opener-settings.test.ts; the Vite production build and src/ui/theme/app.css directly prove build/style integration.
- Module directions remain tests/system/repository-policy/boundaries.test.ts; tests/system/repository-policy/tsconfig-gate-scope.test.ts is the one narrow stable TypeScript graph ownership check.

Implementation result before parent review:
- Generated-derived ownership now lives in src/shared/codex-app-server-contract for supported method sets, ThreadStatus, TurnStatus, and approval decisions. Codex protocol and browser projections consume those schemas. Exact queue wire schemas now live only in codex-protocol and are re-exported by the coordinator tool contract.
- App-server reverse-request ingress remains codex-protocol/transport. codex-browser-model now owns only outbound reverse-response validation; its parallel 686-line request decoder was removed. The unused server-side sequence reducer was deleted. UI deltas retain per-field browser validation and merge once without reparsing a full snapshot; initial and recovery snapshots remain fully validated.
- Shared canonical dynamic-effect serialization/hash and logical call identity replaced duplicate implementations. Differently constrained browser/protocol text and record schemas remain local.
- Applied the retained-owner matrix: removed duplicate shutdown, canvas exit/approval simulations, runtime state-matrix/submission-fencing cases, theme/tool-resolution fixtures, and copied authored-contract/remediation policy scaffolding while preserving transport, broker, gateway, runtime, repository boundary/inventory, production build, and opener owners.

Measured result (same commands at base/current): authored src/tests/scripts/tools lines 226,542 -> 220,087 (-6,455; ba1aacee was 260,645); test()/it() sites 1,754 -> 1,677 (-77; ba1aacee 1,833); production .parse/.safeParse sites 261 -> 245 (-16; ba1aacee 259); complete merged-snapshot delta reparses 2 -> 0. Exact queue schema definition sets 2 -> 1; repeated production ThreadStatus/TurnStatus enum definitions 3 -> 0 outside the shared generated-derived owner.

Validation:
- focused Codex protocol/dynamic/gateway/browser/runtime retained owners: 567 pass, 0 fail.
- transport reverse-response and adversarial owners: 16 pass, 0 fail.
- queue/protocol/thread-tool contract owners: 38 pass, 0 fail.
- repository boundaries, TypeScript gate scope, and inventory: 47 pass, 0 fail.
- frontend TypeScript graph: pass. Root TypeScript graph has only the same 13 diagnostics in active-owner engine/board-inspection files present at the exact base; no new diagnostic.
- real Vite production build: pass (2,614 modules).
- focused Oxfmt/Oxlint: pass. Whole-repository lint reports only four exact-base diagnostics in active-owner engine/board-inspection files; no changed-file diagnostic.
- git diff --check: pass.

No active-owner path, package.json, bun.lock, CONTEXT.md, ADR/rendering proof path, or protected checkout was modified. Acceptance checkmarks, final summary, and Done transition remain for the parent.

Measurement clarification: the canonical test-case count used in the pre-change audit is lines beginning with test( or it(. On that same measure, ba1aacee/base/current are 1,687 / 1,626 / 1,556, so this change removes 70 cases. The 1,833 / 1,754 / 1,677 figures above are a deliberately broader cross-check that also matches nested references; they are not the canonical case measure.

Standards review requested remediation at d8488f76: preserve the consolidation while restoring cross-field delta checks and unique shutdown, mounted replacement, and rendered readiness schedules. Repair also restores the narrow self/other canonical boundary type and replaces the earlier line metric with a reproducible tracked-file count.

Standards-review repair at d8488f76:
- Browser-model now owns one cross-field snapshot relationship check. Full snapshot refinement and the post-merge delta path both call it; delta fields are still parsed only once. The retained transport owner covers unbound and mismatched thread-link deltas.
- Retained cleanup/adversarial transport ownership now covers the five distinct shutdown schedules removed with shutdown.test: no handler, request during flush, admitted but unwritten substitution, response-writer failure, and late diagnostics across shutdown or exit.
- mounted-runtime now has compact tables for all four late settlements after transport replacement and the seven requested account/storage readiness states.
- The retained canvas generation approval owner checks immediately before, at, and after CODEX_APPROVAL_EXPIRY_MS using fake timers and an injected clock, including exactly-once settlement.
- CODEX_THREAD_STATUS_TYPES is the generated-derived status authority used by thread-link membership, InspectWorkhorseResult, coordinator result JSON, browser/thread schemas, and dynamic status acceptance. The canonical fork boundary is discriminated again; runtime effects adapt at the hashing seam and reject a null self boundary.

Metric correction: the earlier 220,087 figure incorrectly applied a diff delta to a baseline collected with different file-selection behavior. The reproducible command is `git grep -I -n "^" <ref> -- src tests scripts tools ":!src/shared/codex-app-server-contract/generated/**" | wc -l`, run independently for each ref. It reports 226,542 at a5146446 and 220,301 at d8488f76, a reduction of 6,241 lines including the 214-line server-responses.ts replacement.

Repair validation: affected transport/UI owners 23 pass; status/dynamic/canvas owners 56 pass; repository boundaries/inventory 46 pass; frontend TypeScript passes; production Vite build passes. Root TypeScript still reports only the same 13 fixed-base diagnostics in protected active-owner files. Focused Oxfmt/Oxlint and git diff checks pass.

Rereview source-head check passed: tracked-clean at 9b8d4db77d61b3eedff1e1ff93cd78ce5694d22c before editing.

Final rereview repair: moved the unchanged typed FakeSocket from transport.test.ts into tests/fake-socket.ts, leaving the retained behavioral owner at 449 lines and the support fixture at 56. Restored the exact handshake state/sequence 7 assertion, sequence 5 after the duplicated delta, and socket_unavailable refresh refusal after incompatible_contract. Validation: workbench-transport 9 pass; repository boundaries and inventory 46 pass; frontend TypeScript, focused Oxfmt/Oxlint, and diff check pass.

Final integration evidence at reconciled source head 3f429d55c8dafa5cc599563b7c0c2a44acb3c3e2: both independent Standards and Spec reviews reported RECONCILIATION_CLEAN for 94377043e27610f13403da16e019aa9bc967a69d..3f429d55c8dafa5cc599563b7c0c2a44acb3c3e2. The source is three direct non-merge commits; range-diff and stable patch IDs matched the reviewed pre-rebase commits, changed paths matched, and canonical-since-old-base paths were blob-identical. Focused immutable-head validation: 55 pass, 0 fail, 186 assertions; git diff --check clean. Reconciled absolute authored-line count is 220,731: canonical is 226,579 after its 37-line addition, so this task delta is -5,848. Canonical case delta is -63 and production parse-site delta is -16. These objective results prove AC1-AC6 to the stated scope; no lint/type/browser gate was weakened.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Collapsed duplicate Codex contracts, ingress validation, and redundant test/scaffolding owners while retaining the documented owner matrix. Independent Standards and Spec reviews were clean; immutable-head focused validation passed 55 tests with 186 assertions and a clean diff check. Reconciled task delta: -5,848 authored lines, -63 canonical cases, and -16 production parse sites.
<!-- SECTION:FINAL_SUMMARY:END -->

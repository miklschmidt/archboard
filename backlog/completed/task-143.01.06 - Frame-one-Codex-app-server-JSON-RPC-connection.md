---
id: TASK-143.01.06
title: Frame one Codex app-server JSON-RPC connection
status: Done
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 03:54'
labels: []
dependencies:
  - TASK-143.01.01
  - TASK-143.01.03
  - TASK-143.01.16
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-transport
  - src/runtime/codex-transport/tests/transport.test.ts
  - src/shared/codex-app-server-capacity
  - src/shared/codex-workbench-identity
  - tests/system/repository-policy/codex-app-server-capacity.test.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 176000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own newline-delimited JSON-RPC framing, request/reverse-request correlation, cancellation settlement, late-result retention, and wire shutdown for one child epoch. It performs no semantic retry and constructs no tool result.

Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Client requests, responses, notifications, errors, and reverse requests correlate by child, epoch, and requestId; logical dynamic calls retain child, epoch, threadId, turnId, callId, namespace, tool, and manifestHash.
- [x] #2 A local timeout or cancellation settles only the local waiter and never claims remote cancellation; late responses remain inspectable and non-idempotent lost responses classify as outcome_unknown.
- [x] #3 Only newline-delimited stdout frames enter the decoder, stderr drains independently, malformed/duplicate/unknown frames fail the owning operation without corrupting later frames, and backpressure is bounded.
- [x] #4 codex-approvals owns seven human responses, the two dynamic dispatchers own item/tool/call responses, and codex-session owns currentTime plus unsupported refresh/attestation responses. Transport validates correlation and writes each supplied response at most once.
- [x] #5 The src/runtime/codex-transport/tests suite exhausts framing, every message direction, correlation, cancellation, late/duplicate/malformed frames, bounded backpressure, response ownership, one-write settlement, and shutdown against fake child streams.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the frozen identity, generated protocol decoder, shared timing, process-stream, and response-ownership contracts at the transport boundary.
2. Implement one instance-scoped newline JSON-RPC transport with bounded writes, exact child/epoch/request and dynamic-call correlation, local settlement, inspectable late results, and deterministic shutdown.
3. Add fake-child stream tests for every direction, response owner, malformed/duplicate/unknown frames, timeout/cancellation, late outcome_unknown results, bounded backpressure, one-write response settlement, and recovery of later frames.
4. Run focused transport tests, complete module and repository lanes, both TypeScript projects, lint, format, diff and clean-status checks; record evidence without finalizing before independent review.

5. Apply the reviewed shared Codex app-server capacity authority, then remediate strict envelope direction, duplicate-key rejection, method-specific reverse schemas, numeric wire IDs, reverse error settlement, two-lane atomic response admission, terminal detachment, deep redacted projections, and adversarial public oracles.

6. Apply independent-review fixes: settle reverse-response promises on accepted-write failure, fail the owning request on known-id duplicate-key responses, preserve terminal late-response diagnostics, centralize remaining non-duration bounds, derive child stdio types from Node, narrow transport entrypoints, and consolidate local test helpers.

7. Resolve ID-only malformed-frame correlation before reverse fallback, add recovery coverage, and truthfully broaden AC #5 to the transport test suite through the Backlog CLI.

8. Audit transport test child streams, queued buffers, timers, listeners, and exact-frame fixtures under capped focused probes; add deterministic cleanup regression and smallest remediation for retained resources.

9. Close blocked FakeStdin writes before child disposal, bind teardown to the harness pair, and verify fail-first cleanup plus focused capped transport evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parallel reservation at integration HEAD 863ec41 after removing the unjustified worker/reviewer caps: TASK-143.01.06 is dependency-ready and path-disjoint from every active leaf. It is dispatched alongside all other ready leaves; only dependency and file-ownership conflicts serialize later work.

Implemented the instance-scoped Codex app-server JSONL transport under src/runtime/codex-transport. It owns complete-line stdout framing, independent stderr draining, bounded writes, request and reverse-request correlation, local timeout/cancellation settlement, inspectable late results, response ownership, and deterministic shutdown. Dynamic tool result construction remains outside the transport. Validation passed: bun test --isolate src/runtime/codex-transport (7 tests), bun run test:modules (1,020 tests), bun run test:repository (130 tests), bun run type-check, bun run lint, bun run fmt:check, and git diff --check. The task remains In Progress for independent review; acceptance criteria and terminal status were not changed.

Remediation committed as 3fea481 (fix(codex-transport): harden app-server wire lifecycle), following the initial implementation 103ddf8 and fixed BASE b5d5062. Centralized all non-duration limits in src/shared/codex-app-server-capacity; added strict duplicate-key JSONL decoding, typed numeric/string wire IDs, dual regular/response admission, owner-aware method-specific reverse validation, bounded late/diagnostic projections, accepted-write settlement semantics, fatal oversized-frame handling, and terminal/shutdown detachment.

Current focused validation: transport contract tests 20 pass / 0 fail / 126 expect across 4 files; capacity and repository-policy tests 6 pass / 0 fail / 152 expect across 2 files; bun run type-check, bun run lint, bun run fmt:check, and git diff --check pass. Preserved broad evidence from before the parent OOM guard: bun run test:modules 1,033 pass / 0 fail / 7,173 expect across 80 files, and bun run test:repository 134 pass / 0 fail / 559 expect across 12 files. No broad lane was rerun after that guard. Task remains In Progress pending independent review; acceptance criteria and terminal status were not changed.

Second independent-review remediation is in code commit 35e7d4d (following 103ddf8, 3fea481, and the prior evidence commit 3fdee76). Reverse-response accepted-write failures now reject respond(), known-id duplicate-key response frames settle the owning request as malformed outcome_unknown, late-response diagnostics survive ordinary shutdown and child failure, and remaining text bounds use the shared canonical capacity contract. Child stdio fields derive from ChildProcessWithoutNullStreams with Node event tuples, the transport public surface is split into narrow client/errors/server-requests/diagnostics entrypoints, notify was removed, and captureRejection is owned once by fake-child support. Validation after remediation: 28 focused transport/capacity tests pass / 0 fail / 437 expect across 6 files; boundaries and module-scope policy owners pass 17 / 0 / 87; bun run type-check, bun run lint, bun run fmt:check, and git diff --check pass. Preserved broad evidence from before the parent OOM guard: bun run test:modules 1,033 pass / 0 fail / 7,173 expect across 80 files and bun run test:repository 134 pass / 0 fail / 559 expect across 12 files; no broad lane was rerun after that guard. Task remains In Progress; acceptance criteria and terminal status were not changed.

Final review remediation is in code commit 4696b23. ID-only malformed frames with a known pending client id now route through response validation before reverse-request fallback, settle the waiter as malformed-response/outcome_unknown, release pending admission, emit no -32600 response for the client id, and preserve later request/response recovery; malformed-routing.test.ts is the focused hostile oracle. AC #5 was updated through the Backlog CLI to name the complete src/runtime/codex-transport/tests suite. Final focused validation: bun test --isolate src/runtime/codex-transport/tests 23 pass / 0 fail / 139 expect across 5 files; boundary and capacity policy owners 13 pass / 0 fail / 370 expect across 2 files; bunx tsc --noEmit, scoped oxlint, scoped oxfmt --check, and git diff --check pass. Preserved broad evidence from before the parent OOM guard remains bun run test:modules 1,033 pass / 0 fail / 7,173 expect across 80 files and bun run test:repository 134 pass / 0 fail / 559 expect across 12 files; no broad lanes were run for this remediation. Task remains In Progress and all ACs remain unchecked.

Resource-regression investigation and focused remediation: the transport harness teardown left FakeChild stdin/stdout/stderr streams, terminal listeners, FakeStdin writes, and a blocked-write callback retained after closeTransport. Added deterministic cleanup.test.ts coverage for destroyed streams, empty readable/writable buffers, cleared writes, and removed child/stream listeners; closeTransport now disposes the child in a finally block, while writes remain inspectable through explicit transport.shutdown() assertions and are cleared only at teardown. Updated every transport test call site to pass its child. Capped evidence (MemoryMax=6G, MemorySwapMax=1G): transport suite 24 pass/0 fail/155 expect, peak 1,218,289,664 bytes; exact-frame ceiling test 1 pass/0 fail/7 expect, peak 1,278,935,040 bytes; cleanup regression 1 pass/0 fail; bunx tsc --noEmit, scoped oxlint (0 warnings/0 errors), scoped oxfmt --check, and git diff --check pass. The earlier 12G/2G integration run failed in the final realtime contract owner after transport tests; the focused realtime contract owner also reaches the 6G/1G cap in its TypeScript compiler, so the prohibited combined sequence was not rerun and this change does not claim to resolve that separate compiler peak. Code commit: 5558f95. Task remains In Progress with acceptance criteria unchecked pending parent integration review.

Rereview remediation: the reviewer reproduced blockNext=true plus a 1,024-byte FakeStdin write followed by child.dispose(); destroyed became true but writableLength stayed 1,024 after a tick because destroy discarded the captured callback without settling Node's active Writable chunk. FakeStdin now settles that callback (including direct destroy), FakeChild.dispose releases before destroy, and createHarness returns an owned close() closure. close() starts transport.shutdown(), releases the captured fake write before awaiting it, and always disposes the paired child in finally; this removes the mismatched closeTransport(transport, child) interface and avoids the composed shutdown timeout. Added fail-first blocked-write assertions for writableLength, destroyed stdio, cleared writes, and listener removal, plus a blocked transport-write shutdown regression. Capped rereview evidence (MemoryMax=6G, MemorySwapMax=1G): cleanup/blocked-write owner 3 pass/0 fail/32 expect, peak 57,679,872 bytes; transport suite 26 pass/0 fail/171 expect, peak 1,496,584,192 bytes; exact-frame owner 1 pass/0 fail/7 expect, peak 1,314,689,024 bytes; bunx tsc --noEmit, scoped oxlint, scoped oxfmt --check, and git diff --check pass. No combined transport+realtime sequence was run and caps were not raised. Code commit: 5bb5374. Task remains In Progress with acceptance criteria unchecked.

Final mechanical rereview fix: extracted the duplicated destroyed-child, buffer, write, and listener assertions into expectChildDisposed(child), called by both setup-specific cleanup tests. No production behavior or gates changed. Capped cleanup owner remains 3 pass/0 fail/34 expect with MemoryPeak 55,840,768 bytes; oxfmt --check and git diff --check pass. Code commit: be03953. Task remains In Progress with acceptance criteria unchecked.

Root acceptance at integrated remediation HEAD 4539475: independent final rereview returned REVIEW_CLEAN for remediation commits through worker HEAD 7c5c9ea. The root capped transport unit archboard-task1430106-transport-4539475.service passed 26 tests and 173 assertions at 1.1G peak with swap 0 under MemoryMax 6G and MemorySwapMax 1G. It covers the prior blocked-write leak, harness-bound close ownership, one disposal contract, exact-frame handling, all transport directions, malformed recovery, backpressure, correlation, one-write settlement, and shutdown. The earlier integration module unit reached the fixed 12G memory and 2G swap caps at the separate final realtime contract owner after all transport tests; the focused realtime TypeScript owner independently reproduces that cap. Per the resource policy, neither sequence was rerun and no cap was raised. That separate compiler peak does not contradict the transport acceptance evidence.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented one instance-scoped Codex app-server JSONL transport with typed request and reverse-request correlation, bounded dual-lane writes, local timeout/cancellation settlement, inspectable late outcomes, strict malformed-frame recovery, owner-specific one-write responses, and deterministic shutdown. Review remediation closed lifecycle, response-settlement, ID-only routing, stream-retention, blocked-write, and test-harness ownership gaps. Independent review was clean and the integrated capped transport suite passed 26 tests and 173 assertions with 1.1G peak and no swap.
<!-- SECTION:FINAL_SUMMARY:END -->

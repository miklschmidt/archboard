---
id: TASK-143.01.08
title: Reduce one typed Codex app-server session
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 06:50'
labels: []
dependencies:
  - TASK-143.01.03
  - TASK-143.01.04
  - TASK-143.01.06
  - TASK-143.01.16
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - src/runtime/codex-session/lib/contract.ts
  - src/runtime/codex-session/lib/session.ts
  - src/runtime/codex-session/tests/logout.test.ts
  - src/runtime/codex-session/tests/methods.test.ts
  - src/runtime/codex-session/tests/response-fixtures.ts
  - src/runtime/codex-session/tests/reverse.test.ts
  - src/runtime/codex-session/tests/session.test.ts
  - src/runtime/codex-session/tests/session-types.ts
  - src/runtime/codex-session/tests/storage.test.ts
  - src/runtime/codex-session/tests/support.ts
  - src/runtime/codex-session/tests/transport-chain-support.ts
  - src/runtime/codex-protocol
  - src/runtime/codex-transport/lib/inbound-router.ts
  - src/runtime/codex-transport/lib/request-operations.ts
  - src/runtime/codex-transport/lib/types.ts
  - src/runtime/codex-transport/tests/fake-child.ts
  - src/runtime/codex-transport/tests/no-params.test.ts
  - src/runtime/codex-transport/tests/transport.test.ts
  - src/shared/codex-workbench-identity/lib/identity.ts
  - src/shared/codex-browser-model/index.ts
  - src/shared/codex-browser-model/lib/authored.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 178000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reduce one exact Codex 0.151.0 app-server session behind typed ports. This is the sole owner of initialize sequencing, capability truth, readiness, pagination modes, ordinary operations, auxiliary reverse requests, and mutation outcome classification. Delegation profile: gpt-5.6-luna, max.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Initialize sends the literal reviewed capabilities object, buffers pre-response notifications, decodes the response, then sends initialized. currentTime/read returns {currentTimeAt: floor(Date.now()/1000)} after validating its ThreadId; unsupported token-refresh/attestation requests receive the reviewed JSON-RPC protocol error exactly once.
- [ ] #2 The six LoginAccountParams variants follow the reviewed support/refusal table. API key, hosted ChatGPT, amazonBedrock, and amazonBedrockAccessKeys login plus account read/cancel/logout remain available before account_ready; chatgptDeviceCode, chatgptAuthTokens, and both profile/environment BedrockSetupParams are refused before RPC.
- [ ] #3 Effective-storage proof requires initialize.codexHome and config/read origins to identify the restrictive CODEX_HOME/config.toml sqlite_home, reconciles configRequirements/managed policy and CODEX roots by canonical realpath, and refuses null, redirected, conflicting, symlink-escaped, or unowned stores.
- [ ] #4 The public port has exactly the authored initialize/config/account/model, thread/page/settings, turn, six queue, injection, realtime/timeline, and three auxiliary response method names. Page methods return one decoded page; authority callers exhaust them with cursor-loop detection and tool/UI callers use epoch/method/query-bound cursors.
- [ ] #5 expectedTurnId is mandatory on steer. Non-idempotent mutations classify delivered, not_delivered, or outcome_unknown and never retry blindly; raw decoded realtime alone crosses to TASK-143.02.03.
- [ ] #6 src/runtime/codex-session/tests/session.test.ts exhausts initialize ordering, pre-response buffering, capabilities, all login/refusal variants, storage proof, reverse requests, pagination, queue/turn/realtime methods, steer identity, and all three mutation outcomes through the typed transport port.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reconcile the generated Codex 0.151.0 schemas and completed process, transport, epoch, identity, and timing ports into a narrow typed session contract; define the reviewed initialization, login, storage-proof, pagination, mutation, and reverse-request policies.
2. Implement the session reducer under src/runtime/codex-session: literal initialize sequencing and buffering, fail-closed effective-storage proof, exact public method vocabulary, typed request builders, cursor modes, steer identity, and delivered/not_delivered/outcome_unknown settlement without retry.
3. Add session.test.ts with a typed transport fake that exhausts initialization/reverse requests, all login/refusal variants, storage failures, pagination modes, queue/turn/realtime methods, steer identity, and mutation outcomes.
4. Run only capped focused session, policy, type, lint, format, and diff checks; record evidence separately in Backlog while leaving acceptance criteria unchecked.

5. Remediate review findings by exposing exact method-specific request payload types and runtime decoders from the pinned protocol boundary, preserving account readiness across logout settlement, binding storage proof to the canonical child checkout, and requiring issued current ThreadIds for reverse currentTime/read.
6. Replace loose request fixtures with complete protocol-owned valid fixtures and hostile missing, extra, closed-union, logout, checkout-scope, and identity cases.
7. Run only capped focused session/protocol type, test, lint, format, and diff checks; record the remediation evidence separately while keeping acceptance criteria unchecked and status In Progress.

8. Make required thread/page request parameters mandatory in the public and implementation ports, with compile-time omission fixtures and valid branded calls.

9. Add noImplicitOverride strict evidence for CodexSessionMutationError and rerun only capped session checks without touching currentTime/read.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved immediately after TASK-143.01.05 finalized at integration HEAD 0aef910357ea216f98ff135c93d6bf70bee73341. This leaf owns src/runtime/codex-session and its focused tests. It composes the completed protocol, process, transport, timing, and epoch contracts without reopening their ownership. The current integration branch has two unrelated assistant-ui policy TypeScript diagnostics already assigned to TASK-143.03.12; this session worker must not fix or absorb them.

Implementation commit: 2ecc1aa (feat(codex-session): reduce one typed app-server session).

Scope: added the typed 34-method session port, initialize/initialized ordering and notification buffering, fail-closed prepared-storage proof, login policy, account/thread readiness, page forwarding, reverse responses, steer identity validation, realtime passthrough, and mutation settlement classification. Added typed FakeTransport coverage in src/runtime/codex-session/tests.

Focused evidence (all under systemd-run --user --scope -p MemoryMax=6G -p MemorySwapMax=1G): bun test --isolate src/runtime/codex-session/tests (13 pass, 129 assertions); scoped bunx tsc --ignoreConfig ... (pass); bunx oxlint src/runtime/codex-session (pass); bunx oxfmt --check src/runtime/codex-session (pass); git diff --check (pass). Full repository/module/system/browser gates were intentionally not run per task scope. Acceptance criteria remain unchecked; task remains In Progress.

Independent review remediation (2026-08-31): four blockers were verified against BASE ab4cb9a1ec35cebb6a52cc8f0d3099467589ccd6 through HEAD 99872e36da76c212d8948dcee096700b5bd20d3b: loose outbound request typing, uncertain logout readiness, unscoped checkout storage proof, and arbitrary raw currentTime ThreadId adoption. The approved narrow scope permits only the existing codex-protocol public boundary where exact generated request types/decoders must be exported; protocol/process/transport/epoch owners remain closed. Remediation remains In Progress with all acceptance criteria unchecked.

Typed-boundary remediation (2026-08-31): cherry-picked protocol boundary commit 119df6c and reconciled session implementation in 0281106. CodexSession now exposes method-specific CodexSessionRequestParams, imports shared BedrockSetupParams, serializes only issued identity fields at the session boundary, and invokes decodeClientRequestParams once before each outbound transport request. Logout gates thread-capable operations before transport and restores readiness only for not_delivered; delivered/unknown failures leave the session login-capable until accountRead. config/read is scoped to the canonical checkoutRoot. Mutation failures always surface as CodexSessionMutationError with cause, outcome, and retryEligible=false. Independent 34-name session oracle covers every public method, complete valid results/pages/cursors, accountRead, and all reverse methods. Combined capped focused suite: 569 pass, 0 fail, 3,530 assertions across codex-protocol and codex-session. Scoped strict TypeScript, Oxlint, Oxfmt check, and git diff --check passed under the 6G/1G systemd cap. Storage hostile coverage is deterministic for wrong-origin file/type, config outside CODEX_HOME, and nested roots; an unowned-root fixture cannot be deterministic under the current test UID without chown/ownership injection, so that remains an explicit manual/contract limitation and is not claimed as automated coverage. Acceptance criteria remain unchecked; task remains In Progress.

Follow-up review scope (2026-08-31): remediate only mandatory threadTurnsListPage, threadItemsListPage, queueListPage, and timelineListPage parameters plus the CodexSessionMutationError inherited cause override. CurrentTime/read remains assigned to the dedicated boundary worker and is intentionally out of scope.

Follow-up remediation (2026-08-31): commit 250810e requires branded threadId-bearing params for threadTurnsListPage, threadItemsListPage, queueListPage, and timelineListPage in both CodexSession and createCodexSession implementations. Added session-types.ts compile-time fixtures proving valid branded calls compile and omitted arguments fail. Marked CodexSessionError.cause with override for noImplicitOverride. Focused evidence under the 6G/1G systemd cap: 20 session tests passed with 268 assertions; strict scoped TypeScript with noImplicitOverride passed; scoped Oxlint, Oxfmt check, and git diff --check passed. CurrentTime/read remains untouched and owned by the dedicated boundary worker. Acceptance criteria remain unchecked; task remains In Progress.

Final reconciliation evidence (2026-08-31, code HEAD 36f6efc0 before this evidence update): preserved the mandatory branded page-query params and CodexSessionError cause override from 250810e, integrated currentTime/read identity and transport resolution from 175d1283 (source 6315359), and integrated the final no-parameter boundary from 36f6efc0 (source 04e4ddb6). configRequirements/read and account/logout now use exact undefined request typing and decoding, omit params on the wire, reject invented object params, and expose zero-argument accountLogout; object-param methods still reject undefined. currentTime/read resolves raw wire ThreadIds only through issued current identity and the transport/session reverse-request path is covered by real frames.

Combined focused validation under systemd-run --user --scope -p MemoryMax=6G -p MemorySwapMax=1G: bun test --reporter=dots src/runtime/codex-protocol/tests/*.test.ts src/shared/codex-workbench-identity/tests/*.test.ts src/runtime/codex-transport/tests/*.test.ts src/runtime/codex-session/tests/*.test.ts — 605 pass, 0 fail, 3,797 expect() calls across 18 files. Assistant-ui policy owner independently passed 12 tests / 282 expect() calls.

Type validation: bunx tsc --noEmit -p tsconfig.frontend.json passed. The root bunx tsc --noEmit (and therefore bun run type-check before its frontend leg) still reports exactly two diagnostics already owned by TASK-143.03.12: tests/system/repository-policy/assistant-ui-imports.test.ts:168:64 TS2769 (unknown is not assignable to string) and :324:68 TS2345 (string | undefined is not assignable to string). No assistant-ui files were changed. Scoped Oxlint passed, Oxfmt --check passed on 77 files, and git diff --check passed.

Protected protocol fingerprint guard was attempted with the mandated 6G/1G cap; systemd reported oom-kill at the 6G limit with 641.5M swap peak while parsing the 820-file generated tree. A bun --smol retry also hit the same cap (664.5M swap). This is an environment/resource-limited check and is not claimed as a semantic pass.

Task remains In Progress and all acceptance criteria remain unchecked; full repository/module/system/browser lanes were not run.
<!-- SECTION:NOTES:END -->

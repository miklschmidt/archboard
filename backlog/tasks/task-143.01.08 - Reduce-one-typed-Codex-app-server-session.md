---
id: TASK-143.01.08
title: Reduce one typed Codex app-server session
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 15:07'
updated_date: '2026-08-31 05:25'
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
  - src/runtime/codex-session
  - src/runtime/codex-session/tests/session.test.ts
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
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reserved immediately after TASK-143.01.05 finalized at integration HEAD 0aef910357ea216f98ff135c93d6bf70bee73341. This leaf owns src/runtime/codex-session and its focused tests. It composes the completed protocol, process, transport, timing, and epoch contracts without reopening their ownership. The current integration branch has two unrelated assistant-ui policy TypeScript diagnostics already assigned to TASK-143.03.12; this session worker must not fix or absorb them.

Implementation commit: 2ecc1aa (feat(codex-session): reduce one typed app-server session).

Scope: added the typed 34-method session port, initialize/initialized ordering and notification buffering, fail-closed prepared-storage proof, login policy, account/thread readiness, page forwarding, reverse responses, steer identity validation, realtime passthrough, and mutation settlement classification. Added typed FakeTransport coverage in src/runtime/codex-session/tests.

Focused evidence (all under systemd-run --user --scope -p MemoryMax=6G -p MemorySwapMax=1G): bun test --isolate src/runtime/codex-session/tests (13 pass, 129 assertions); scoped bunx tsc --ignoreConfig ... (pass); bunx oxlint src/runtime/codex-session (pass); bunx oxfmt --check src/runtime/codex-session (pass); git diff --check (pass). Full repository/module/system/browser gates were intentionally not run per task scope. Acceptance criteria remain unchecked; task remains In Progress.
<!-- SECTION:NOTES:END -->

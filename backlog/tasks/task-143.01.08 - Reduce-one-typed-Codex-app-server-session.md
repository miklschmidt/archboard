---
id: TASK-143.01.08
title: Reduce one typed Codex app-server session
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 17:27'
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
<!-- AC:END -->

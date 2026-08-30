---
id: TASK-143.01.08
title: Reduce one typed Codex app-server session
status: To Do
assignee: []
created_date: '2026-08-30 15:07'
updated_date: '2026-08-30 16:36'
labels: []
dependencies:
  - TASK-143.01.03
  - TASK-143.01.04
  - TASK-143.01.06
  - TASK-143.01.16
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
modified_files:
  - src/runtime/codex-session
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 178000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reduce one exact Codex 0.151.0 app-server session behind typed ports. This is the sole owner of initialize sequencing, capability truth, readiness, pagination, ordinary thread/turn/item/queue operations, and non-idempotent outcome classification.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Initialize sends experimentalApi true, requestAttestation false, only implemented extension capabilities, buffers pre-response notifications, accepts the decoded response, then sends initialized before other operations.
- [ ] #2 Typed ports cover account read/login/cancel/logout and Bedrock discover/setup; config/configRequirements; thread start/read/delete/fork/settings/inject/timeline; turn start/settings/steer/interrupt; item and queue operations required by this plan, with expectedTurnId mandatory on steer.
- [ ] #3 Thread, loaded-thread, model, timeline, turn/item, and queue reads exhaust every nextCursor page, detect repeated cursors, and return stable decoded order; settings readiness waits for the matching settings-updated notification.
- [ ] #4 Effective-storage proof reconciles initialize.codexHome, the configured and managed sqlite_home values, CODEX_HOME/CODEX_SQLITE_HOME, and canonical realpaths across symlinks; a redirect, conflict, unprovable env-only store, or managed requirement refuses thread capability.
- [ ] #5 Readiness separates initialized, storage_proven, login_capable, account_ready, and thread_capable: account operations remain available before account_ready, while thread operations refuse until account and storage are ready for apiKey, chatgpt, or amazonBedrock.
- [ ] #6 Non-idempotent mutations classify delivered, not_delivered, or outcome_unknown and are never blindly retried; realtime leaves this module only as raw decoded 0.151.0 events for TASK-143.02.03.
<!-- AC:END -->

---
id: TASK-143.01.15
title: Verify the composed Codex lifecycle across reload and shutdown
status: To Do
assignee: []
created_date: '2026-08-30 16:25'
updated_date: '2026-08-30 17:27'
labels: []
dependencies:
  - TASK-143.01.14
references:
  - docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md
  - docs/design/codex-workbench-authored-contracts.md
modified_files:
  - tests/system/process-contracts/codex-workbench-lifecycle.test.ts
parent_task_id: TASK-143.01
priority: high
type: task
ordinal: 245000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Own the one real-process lifecycle and protocol owner for the production Codex composition seam. It tests public server behavior against controlled exact-version and clean-home processes; it does not instantiate an alternate graph. Delegation profile: gpt-5.6-sol, medium.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A clean restrictive home proves config.toml materialization, initialize.codexHome, config origin/sqlite_home, managed-requirement reconciliation, account readiness, and one executable link; env-only/null, redirected, symlink, and conflicting stores refuse.
- [ ] #2 The process owner drives all eleven server-request variants through the exhaustive production router, including whole-second currentTime/read and exact token-refresh/attestation errors, with no dropped/double response.
- [ ] #3 Through public ports it covers all six general tools, their confirmed/partial/uncertain results, two-home isolation, general/coordinator dynamic calls, and seven approval families; module owners retain exhaustive fake-port target and policy matrices.
- [ ] #4 Reload during in-flight RPC/reverse requests preserves one child/listener/coordinator/queue/broker/gate with handler replacement; child exit, signals, and normal close settle/classify work and leave no orphan.
<!-- AC:END -->

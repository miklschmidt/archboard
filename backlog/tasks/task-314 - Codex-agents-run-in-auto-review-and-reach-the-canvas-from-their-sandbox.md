---
id: TASK-314
title: Codex agents run in auto-review and reach the canvas from their sandbox
status: To Do
assignee: []
created_date: '2026-09-23 21:35'
labels:
  - codex
  - coordinator
dependencies: []
references:
  - src/runtime/codex-process/lib/storage.ts
  - src/runtime/skill-evaluation/lib/isolation.ts
priority: high
type: enhancement
ordinal: 546000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The config.toml archboard writes into its Codex home held only `sqlite_home`, so every thread ran on Codex defaults: a read-only sandbox with on-request approvals. Inside that sandbox no archboard CLI command works, because the CLI must reach the canvas over localhost (network is blocked) and its logger cannot open a log file (EROFS). In the 2026-09-23 23:15 voice session the workhorse therefore asked the user to approve `./bin/dogfood semantic` outside the sandbox, and cancelling that request aborted the turn. The user asked for a standard config that uses auto approval by default. Codex 0.155.1 calls this mode auto-review (`approvals_reviewer = "auto_review"`, a reviewer subagent approves or denies escalations); its TUI pairs it with on-request approvals and the workspace-write profile. The skill-evaluation author config already gives agents a workspace-write sandbox with network access so they can reach the local canvas.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The config archboard writes sets on-request approvals, the auto_review reviewer and a workspace-write sandbox with network access, besides sqlite_home, and a started app-server reports those values as effective
- [ ] #2 A Codex home that still holds the earlier one-line config is upgraded on the next start; any other existing config is still refused
- [ ] #3 The docs that describe the Codex home config say what it now holds and why
<!-- AC:END -->

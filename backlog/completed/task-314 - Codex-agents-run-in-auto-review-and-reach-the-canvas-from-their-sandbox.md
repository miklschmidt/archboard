---
id: TASK-314
title: Codex agents run in auto-review and reach the canvas from their sandbox
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 21:35'
updated_date: '2026-09-23 21:40'
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
- [x] #1 The config archboard writes sets on-request approvals, the auto_review reviewer and a workspace-write sandbox with network access, besides sqlite_home, and a started app-server reports those values as effective
- [x] #2 A Codex home that still holds the earlier one-line config is upgraded on the next start; any other existing config is still refused
- [x] #3 The docs that describe the Codex home config say what it now holds and why
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Write the auto-review permissions into the config archboard owns (storage.ts): on-request approvals, approvals_reviewer auto_review, workspace-write sandbox with network access, following the skill-evaluation author config precedent.
2. Replace archboard's own earlier one-line config for this sqlite home on the next start; keep refusing any other config.
3. Prove the effective values against the pinned Codex 0.155.1 binary with --strict-config (manual probe; a strict-config rejection would stop every canvas start, so normal use owns a future break).
4. Loosen tests that pinned the one-line text to the sqlite_home line; update TESTING.md, DESIGN.md and the voice acceptance doc.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified against the pinned Codex 0.155.1 binary (app-server --stdio --strict-config, scratch CODEX_HOME prepared by prepareCodexStorage): config/read reports approval_policy on-request, approvals_reviewer auto_review, sandbox_mode workspace-write, sandbox_workspace_write.network_access true; a thread/start reports approvalPolicy on-request, approvalsReviewer auto_review, sandbox workspaceWrite with networkAccess true. A home holding the earlier one-line config for the same sqlite home starts with the new config; a config with a foreign key is refused with config_conflict. bun test src/runtime/codex-process (56 pass), the two changed process-contract system tests (4 pass), type-check exit 0, lint exit 0, oxfmt clean. No permanent owner for the effective values: a key Codex no longer accepts fails --strict-config and stops every canvas start. Inside workspace-write the CLI logger cannot write the state directory and falls back to /tmp/archboard.log.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The config.toml archboard writes into its Codex home now sets Codex's auto-review mode (on-request approvals, the auto_review reviewer, a workspace-write sandbox) and network access so archboard commands reach the canvas from the sandbox. Archboard's own earlier one-line config is replaced on the next start; any other config is still refused. Verified against the pinned Codex binary under --strict-config, with the storage unit tests and the process-contract system tests.
<!-- SECTION:FINAL_SUMMARY:END -->

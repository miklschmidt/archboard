---
id: TASK-020
title: Make archboard runnable end to end for voice testing
status: Done
assignee: []
created_date: '2026-08-19 18:39'
updated_date: '2026-08-19 19:24'
labels:
  - needs-triage
dependencies: []
ordinal: 20000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A documented path from a fresh checkout to Codex driving archboard
- [x] #2 MCP wiring for Codex is stated concretely, not described
- [x] #3 The realtime feature flag and its default-off state are called out
- [x] #4 A first session script exists: what to draw, promote, branch and compare
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TESTING.md covers all four: build and vault setup, a concrete [mcp_servers.archboard] block for ~/.codex/config.toml, the realtime_conversation feature flag with its default-off state called out (key dug out of codex-rs/features/src/lib.rs rather than guessed), and a first-session script through draw/select/promote/save/branch/compare. It also states plainly what is not wired yet so the tester is not hunting for a push channel that does not exist — that part becomes false when TASK-019 lands and must be updated then.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TESTING.md documents the path from a fresh checkout to Codex driving a board by voice, including the two non-obvious steps: ARCHBOARD_VAULT must be set before starting the server because the server does the vault I/O, and the archboard/* tool prefix comes from the mcp_servers key rather than the server name.
<!-- SECTION:FINAL_SUMMARY:END -->

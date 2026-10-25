---
id: TASK-529.02
title: The timing package interface is grouped by owner
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T01:26:00Z'
updated_date: '2026-10-25T05:44:00Z'
labels: []
dependencies: []
parent_task_id: TASK-529
type: task
ordinal: 943000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Part of TASK-529 for the timing package(s). TASK-500 kept every name callers imported, so callers assemble internals.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The callers use only the package's narrowed public entries, and the package's focused tests, type-check and lint pass
- [x] #2 Each public entry exposes operations a caller needs, measured by the names and facts it must learn
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Regrouped @archboard/timing by owner: 2 subpaths and 146 names became 1 subpath and 38 names (bun /tmp/iface/count.ts). Each owner has one frozen group in its own file (BOARD_LOCK_MS, CLAIM_MS, PANE_MS, SHELL_CLOCK_MS, BOARD_CACHE_MS, COLUMN_MS, PICTURE_MS, PRESENTATION_MS, RECORDING_MS, RECORDER_MS, REPLAY_MS, VOICE_MS, SUBTITLE_MS, IMAGE_CLIPBOARD_MS, SERVER_LIFECYCLE_MS, GIT_MS, CODEX_PROCESS_MS, CODEX_SESSION_MS, CODEX_REALTIME_MS, CODEX_APPROVAL_MS, SKILL_EVAL_MS), each key with its reason beside it, typed as numbers through the private durations() helper. The Codex restart backoff moved behind codexRestartDelayMs. ./voice folded into '.'. Ten durations nothing read were deleted (REPORT_*, DEFAULT_SETTLE*, BROWSER_EXPORT/CAPTURE/VIEWPORT, BOARD_PREVIEW_STALE_MS). The renderer's flat names (SEMANTIC_RASTER_*, HEADLESS_CHROMIUM_CALL_MS, FAR_VIEW_SWAP_MS, FLOW_CYCLE_CAP_MS, plus the shared PROCESS_GROUP_OBSERVATION_POLL_MS and CLI_INTERRUPT_CLEANUP_MS) are unchanged. Checks: type-check 0, lint 0, repository-policy 149 pass, focused package tests 1926 + 2197 pass (two load timeouts at load average 95 passed on rerun). Left: a poll-until-deadline loop repeats in server-lifecycle spawn.ts (twice), workspace git-command.ts and skills process.ts; a shared helper would retire them.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The timing package exports grouped duration objects per owner (BOARD_LOCK_MS, CLAIM_MS, PANE_MS, VOICE_MS, SUBTITLE_MS, GIT_MS, SERVER_LIFECYCLE_MS, CODEX_PROCESS_MS, RECORDING_MS and others) instead of one name per duration, built by a private durations() helper, plus codexRestartDelayMs(attempt). Ten durations nothing read were deleted. Width 146 -> 38 (ceiling 38). Verified by type-check, lint, the timing and caller tests and the full gate. Follow-up: CODEX_REALTIME_MS.recovery remains to be grouped with its owner.
<!-- SECTION:FINAL_SUMMARY:END -->

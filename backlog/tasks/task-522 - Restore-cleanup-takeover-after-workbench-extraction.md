---
id: TASK-522
title: Restore cleanup takeover after workbench extraction
status: Done
assignee:
  - '@codex'
created_date: '2026-10-24 13:53'
updated_date: '2026-10-24 14:05'
labels: []
dependencies: []
references:
  - /tmp/task517.02-test-system.log
priority: high
type: bug
ordinal: 932000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TASK-517.02 normal system lane failed public cleanup-error takeover before the Codex group spawned. The launcher reported failed cleanup without an exact group identity. The existing process contract must retain its terminal cleanup proof after extraction.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The observed startup failure has a reproduced cause and a scoped repair.
- [x] #2 Public cleanup takeover reaps the exact Codex group and outer server under the unchanged contract.
- [x] #3 The repaired complete gate passes before this task closes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Reproduce the reported public startup takeover failure and inspect its retained diagnostics. Repair the concrete cause while retaining exact group proof, cleanup assertions, and time limits. Use the existing process owner and focused related cases. Require the complete gate before closure. No separate board proposal is needed for an internal startup or fixture correction; TASK-517 already draws the shared owner topology.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The failure reproduced because public-codex-startup-preload.ts imported the removed workbench application module before Codex could spawn. Commit e7ac4e0be wraps the shared public createCodexWorkbench factory instead. Production code, assertions, timing contracts, and environment stay unchanged. Both startup cases and all 25 related cleanup cases pass. Scoped lint, formatting, and source types pass. Full gate remains pending.

The repaired bun run check exited 0 in 559 seconds. The system lane passed all 259 cases, including public cleanup takeover. Evidence: /tmp/task517.02-check-repaired.log and matching .exit.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Updated the public startup preload to wrap the shared factory. Startup and cleanup owners pass under unchanged assertions and timing. The complete gate passes.
<!-- SECTION:FINAL_SUMMARY:END -->

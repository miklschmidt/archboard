---
id: TASK-451
title: Allow diagram corpus renders more time on hosted CI
status: Done
assignee:
  - '@codex'
created_date: '2026-10-08 21:02'
updated_date: '2026-10-08 21:39'
labels: []
dependencies: []
references:
  - 'https://github.com/miklschmidt/archboard/actions/runs/37776895342'
documentation:
  - docs/agents/test-suite.md
type: bug
ordinal: 734000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub Actions run 37776895342 fails only diagram corpus timing on Ubuntu: first layouts reach 45.3 seconds and cases time out at 20 seconds. The user requests longer diagram timeouts in CI. Local corpus passes all 38 cases in 52.76 seconds. The macOS EPERM failure is separate.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Hosted CI gives every diagram corpus case and first-render assertion a finite 60-second limit.
- [x] #2 Local diagram limits and all picture correctness assertions stay unchanged.
- [x] #3 The diagram corpus and complete repository gate pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. No architecture board is affected because this change only adjusts test timing.
2. Use CI=true to select 60-second case and first-render limits for every corpus board on both engines. Keep local limits unchanged.
3. Document the hosted limits and run the corpus with CI=true, then the complete gate.
4. Commit the code and Backlog record.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The CI-mode diagram corpus passed all 38 cases and 323 assertions in 52.93 seconds.

The complete bun run check gate passed with process and browser permissions. All 4431 module tests, 197 system tests, 24 repository tests, and serial browser owners passed. One module test was skipped.

The default sandbox prevented local listeners and process startup. The successful run used the required permissions. The locked install restored the pinned axe-core dependency and changed no lockfile.

Logs: /tmp/archboard-ci-wide-boards-updated.log and /tmp/archboard-ci-full-gate-escalated.log.

No architecture board changed because this work adjusts only test deadlines and documentation. The final simplification pass keeps one hosted limit for both rendering bounds. The separate macOS EPERM failure remains outside the requested timeout change.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
CI=true now gives every diagram corpus case a 60-second deadline. The first-render assertion also allows 60 seconds in CI. Local limits and picture correctness assertions stay unchanged. All 38 CI-mode corpus cases and the complete bun run check gate pass.
<!-- SECTION:FINAL_SUMMARY:END -->

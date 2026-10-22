---
id: TASK-503
title: >-
  The Codex environment test measures the spawn boundary before runtime
  additions
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-22 02:06'
updated_date: '2026-10-22 02:07'
labels: []
dependencies: []
type: bug
ordinal: 910000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TASK-502 gate fails in the Codex process owner test on this NixOS host. Even a minimal Bun child launched with only HOME and PATH reports LD_LIBRARY_PATH too. The current test mistakes a runtime addition for an Archboard environment leak.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The process test still asserts the exact environment passed to the real child spawn and rejects ambient secret or working-directory leakage.
- [ ] #2 The focused process owner tests and the complete normal gate pass without filtering runtime environment keys or changing the product allowlist.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Observe the environment at the existing real spawn dependency boundary. Keep child argv, private home, secret exclusion, readiness and cleanup assertions. 2. Run the focused process owner tests, then the complete normal gate with TASK-502. No board is affected because this change corrects a test observation point.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The original focused case failed consistently because the launched Bun runtime reported an extra LD_LIBRARY_PATH key. A minimal node:child_process spawn of Bun with only HOME and PATH reproduced the addition. The same exact-key assertion now observes the environment at the existing spawn dependency and forwards all arguments unchanged to the real node:child_process spawn. Child argv, private home, secret exclusion, readiness and cleanup assertions remain. All 13 process owner tests passed after the fix.
<!-- SECTION:NOTES:END -->

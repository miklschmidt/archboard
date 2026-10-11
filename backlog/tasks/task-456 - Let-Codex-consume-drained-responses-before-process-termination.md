---
id: TASK-456
title: Let Codex consume drained responses before process termination
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-11 15:20'
updated_date: '2026-10-11 15:21'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 736000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The normal local gate at 9a9ab66b fails codex-workbench-termination: SIGINT shutdown-ordinary has no response. The unchanged focused owner reproduces the same failure on diagnostic run five. Transport shutdown drains stdin, but process shutdown immediately sends TERM before the child consumes queued frames.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The unchanged SIGINT and SIGTERM owner reliably records exactly one terminal response for every pending request class.
- [ ] #2 Process shutdown gives stdin EOF a bounded chance to close the child before TERM, and retains group ownership checks and the composed deadline.
- [ ] #3 Complete local and hosted normal gates pass without changing assertions, owners, validation policy, or test timeout contracts.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Affected proposal: Agent workbench@TASK-456. Preserve all terminal response assertions. Add a deterministic process lifecycle owner for natural child closure after stdin EOF before TERM. Give the current child a short bounded EOF grace inside the existing composed deadline, then retain normal TERM/KILL group cleanup. Test both cooperative and resistant children. Run unchanged terminal process owners, remaining lanes, scoped review, and the complete local and hosted gates.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The normal gate and focused diagnostic run five both miss SIGINT shutdown-ordinary. The transport closes stdin after its writer drains. Process shutdown then calls ensureGroupCleanup, whose initiateTerm sends SIGTERM synchronously. The child can receive TERM before its data handler consumes the drained frames.
<!-- SECTION:NOTES:END -->

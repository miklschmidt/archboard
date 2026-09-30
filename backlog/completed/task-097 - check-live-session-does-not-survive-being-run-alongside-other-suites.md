---
id: TASK-097
title: 'Merged into TASK-086: condition-based canvas process lifecycle'
status: Done
assignee: []
created_date: '2026-08-22 17:47'
updated_date: '2026-08-28 00:35'
labels: []
dependencies:
  - TASK-086
references:
  - scripts/check-live-session.mjs
  - .github/workflows/ci.yml
priority: medium
type: chore
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The original contention diagnosis was TASK-099 and is complete. The remaining blanket audit of every sleep in scripts would cause broad churn across checks whose subject often is elapsed time. The concrete, repeated robustness problem is owned by TASK-086: verified child startup, early-death reporting, bounded shutdown, exit waiting, stderr capture, and cleanup for canvas processes.

No standalone implementation remains here. Future fixed waits should be changed when a failing check identifies the condition it actually needs, not through a repository-wide timing rewrite.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 TASK-086 owns condition-based startup and teardown for the canvas processes implicated by the confirmed leak and misleading failures.
- [x] #2 No repository-wide fixed-wait audit or general polling framework remains committed work.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Verify TASK-086 contains the concrete process lifecycle scope. 2. Close this duplicate without implementation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Audit on 2026-08-28 found many fixed waits whose subjects differ, including deliberate settle windows and timing tests. A blanket conversion would obscure those tests and create churn. The confirmed lifecycle failure is now scoped in TASK-086.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Merged the only concrete remaining work into TASK-086: verified canvas child startup, early-death reporting, bounded shutdown, exit waiting, stderr capture, and owned cleanup. Retired the repository-wide fixed-wait audit because many waits deliberately measure settling or timing and no current failure justifies rewriting them.
<!-- SECTION:FINAL_SUMMARY:END -->

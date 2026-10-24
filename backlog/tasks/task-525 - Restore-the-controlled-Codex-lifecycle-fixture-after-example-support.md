---
id: TASK-525
title: Restore the controlled Codex lifecycle fixture after example support
status: Done
assignee:
  - '@codex'
created_date: '2026-10-24T14:52:00Z'
updated_date: '2026-10-24T15:08:00Z'
labels: []
dependencies: []
priority: high
type: bug
ordinal: 935000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The TASK-517.03 complete gate reports ten system failures before lifecycle scenarios start. The shared fixture extension rejects a changed source insertion point in fake-codex-production.ts. The example added a small ordinary-only control to that fixture.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every lifecycle scenario starts and passes through its existing assertions.
- [x] #2 The fixture extension keeps explicit drift detection and the complete normal gate passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board changes: repair the test fixture integration only. Reproduce the failing owners and identify the exact changed insertion point. Keep all scenarios, assertions, guards, and timeouts. Use the smallest compatible fixture repair, run affected owners and scoped checks, simplify, and commit. The parent reruns the complete normal gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Commit 848efe4cb changes only the controlled lifecycle helper. It now matches the ordinaryOnly condition added by dc8075788 and preserves that condition in the extended item list. Every drift guard, assertion, and timeout stays intact. Ten affected cases and 54 related query, queue, and spoken-approval cases pass. Source/test lint, both type projects, and formatting pass. Full gate remains parent-owned.

The complete repaired gate exits 0 in 534 seconds at 33aa81f0f. All 261 system cases pass, including the ten previously blocked lifecycle cases. Total gate result: 5,378 passes, one skip, zero failures. Evidence: /tmp/task517.03-check-repaired.log and exact .exit/.duration sidecars.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Updated the fixture insertion to retain ordinaryOnly while adding lifecycle items. All drift detection and behavior assertions remain. Ten affected cases, 54 related cases, both type projects, lint, formatting, and the complete normal gate pass.
<!-- SECTION:FINAL_SUMMARY:END -->

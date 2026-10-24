---
id: TASK-525
title: Restore the controlled Codex lifecycle fixture after example support
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-24T14:52:00Z'
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
- [ ] #1 Every lifecycle scenario starts and passes through its existing assertions.
- [ ] #2 The fixture extension keeps explicit drift detection and the complete normal gate passes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
No architecture board changes: repair the test fixture integration only. Reproduce the failing owners and identify the exact changed insertion point. Keep all scenarios, assertions, guards, and timeouts. Use the smallest compatible fixture repair, run affected owners and scoped checks, simplify, and commit. The parent reruns the complete normal gate.
<!-- SECTION:PLAN:END -->

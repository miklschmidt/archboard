---
id: TASK-516
title: Prove Bun runtime compatibility before migrating tests to vp test
status: To Do
assignee: []
created_date: '2026-10-24 02:29'
labels: []
dependencies: []
references:
  - TASK-500
  - TASK-515
type: spike
ordinal: 923000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The Vite+ tooling migration keeps the existing Bun test lanes. A test-runner move requires evidence because product code uses Bun APIs and process.execPath starts fixture servers. Trial the Vite+ test runner under Bun before selecting a migration approach.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A small board-write and server-cleanup trial records Bun APIs, process.execPath, worker pools, and process cleanup behavior under the bundled runner.
- [ ] #2 The result identifies which test owners can move and records a plan that preserves every required runtime boundary and keeps the suite fast.
<!-- AC:END -->

---
id: TASK-507
title: Module tests return the test result without a leaked CLI exit status
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-22 12:26'
updated_date: '2026-10-22 12:29'
labels: []
dependencies: []
references:
  - 'https://github.com/miklschmidt/archboard/actions/runs/39759937550'
priority: high
type: bug
ordinal: 914000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub Actions run 39759937550 on main reports 4,869 passing module tests, one skip, and zero failures, then exits 2. The normal gate stops before its system, repository, and browser lanes. The macOS job passes. The user requests a repair of the failing main CI run.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A focused reproduction catches the nonzero module-process status despite passing assertions and passes after the repair.
- [ ] #2 CLI refusal statuses and the existing normal test owners remain covered without weakening checks or time limits.
- [ ] #3 The complete normal gate and hosted CI pass on the repaired revision.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Keep the CLI product exit contract unchanged. Repair only three CLI test cleanup sites that restore an unset exit code. No architecture board is affected.
2. Use the existing check and recording-language owners as the regression loop, including their native process statuses. Restore an unset prior status as numeric zero.
3. Run the affected owners alone and together, then review the cleanup contract before push. Require the complete normal gate and hosted CI.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The individual owners reproduce the exact failure: vault/check.test.ts reports 1 pass and 0 fail but exits 1; draw/record-language.test.ts reports 2 pass and 0 fail but exits 2. Both complete below 0.31 seconds. Bun 1.4.3 leaves the current status unchanged when process.exitCode receives undefined. These tests restore an unset captured value after exercising a real CLI refusal. File order masks this defect when another owner first sets zero. The full CLI folder passes because its order provides that masking state. Logs: /tmp/archboard-task507-isolated-1.log and /tmp/archboard-task507-isolated-2.log.

The repair changes only three cleanup assignments in CLI tests: help, vault check, and recording language. Each now restores the captured status with ?? 0, matching the other CLI owners. The original isolated checks now exit zero with unchanged assertions: help 8 pass, vault check 1 pass, recording language 2 pass. No new abstraction, product behavior, test owner, deadline, or dependency is added. The original existing owners provide the regression evidence through both their assertions and native process status.
<!-- SECTION:NOTES:END -->

---
id: TASK-130.02
title: Convert repository policy checks to native Bun tests
status: To Do
assignee: []
created_date: '2026-08-28 01:02'
labels: []
dependencies:
  - TASK-130.01
references:
  - scripts/check-ci-suites.mjs
  - scripts/check-boundary-plugin.mjs
  - scripts/check-module-scope.mjs
  - scripts/check-skills.mjs
  - docs/agents/test-suite.md
parent_task_id: TASK-130
priority: medium
type: chore
ordinal: 137000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Repository policy checks currently run as self-reporting scripts with process.exit and console output. Convert check-ci-suites, check-boundary-plugin, check-module-scope, and check-skills into typed native tests. Preserve their self-tests and real subprocess boundaries.

This task owns the evolving test inventory rule. During migration it must understand both remaining legacy script lanes and native Bun test lanes, refuse an omitted test, and refuse a test reached by more than one lane.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check-ci-suites, check-boundary-plugin, check-module-scope, and check-skills are replaced by typed bun:test files under the repository-policy system-test ownership defined by TASK-130.01.
- [ ] #2 The boundary and module-scope tests still run their real Oxlint or TypeScript parser paths against temporary fixtures and assert the exact allowed and refused classes documented today.
- [ ] #3 Every temporary fixture is removed after success and assertion failure, and no test mutates authored repository files.
- [ ] #4 A native inventory test fails when a package test lane is absent from the push chain, a native test belongs to no lane, or a native test can run through more than one lane.
- [ ] #5 The existing negative self-tests remain executable through named native assertions rather than a command-line self-test mode.
- [ ] #6 The legacy scripts are deleted only after focused parity runs prove the native tests catch their documented failure fixtures.
<!-- AC:END -->

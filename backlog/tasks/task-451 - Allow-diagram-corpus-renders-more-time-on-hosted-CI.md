---
id: TASK-451
title: Allow diagram corpus renders more time on hosted CI
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-08 21:02'
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
- [ ] #1 Hosted CI gives every diagram corpus case and first-render assertion a finite 60-second limit.
- [ ] #2 Local diagram limits and all picture correctness assertions stay unchanged.
- [ ] #3 The diagram corpus and complete repository gate pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. No architecture board is affected because this change only adjusts test timing.
2. Use CI=true to select 60-second case and first-render limits for every corpus board on both engines. Keep local limits unchanged.
3. Document the hosted limits and run the corpus with CI=true, then the complete gate.
4. Commit the code and Backlog record.
<!-- SECTION:PLAN:END -->

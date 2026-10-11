---
id: TASK-141
title: Restore opener-persistence coverage on GitHub Actions
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-30 04:52'
updated_date: '2026-10-11 14:23'
labels: []
dependencies:
  - TASK-138
references:
  - 'https://github.com/miklschmidt/archboard/actions/runs/33292227066'
priority: high
type: bug
ordinal: 156000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
GitHub-hosted Actions repeatedly enters tests/system/code-targets/opener-persistence.test.ts and then hangs in Bun cancellation cleanup until the retained 30-minute job cap, while the unchanged owner passes locally. Restore this owner to the hosted complete suite by making its failure and cancellation cleanup terminate deterministically on GitHub runners, then remove the exact temporary CI-only exclusion introduced by TASK-138.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The cause of the opener-persistence cancellation-cleanup hang is diagnosed from a reproducible hosted or equivalent constrained execution and recorded with actionable evidence.
- [ ] #2 ARCHBOARD_CI_EXCLUDED_SYSTEM_OWNER and its tests, policy, workflow configuration, and documentation exception are removed, so opener-persistence is again selected in GitHub Actions.
- [ ] #3 The exact hosted opener-persistence owner completes with all existing assertions and cleanup checks; no assertion, timeout requirement, local selection, skip, or allow-failure is weakened.
- [ ] #4 A complete GitHub Actions run finishes green within the retained 30-minute workflow budget with opener-persistence included.
- [ ] #5 The complete local bun run check remains green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Retain historical hosted failure evidence, restore the current complete inventory and prerequisites, exercise Linux and local gates, and run scoped standards/specification review. No board is affected: this restores CI selection and test tooling.
<!-- SECTION:PLAN:END -->

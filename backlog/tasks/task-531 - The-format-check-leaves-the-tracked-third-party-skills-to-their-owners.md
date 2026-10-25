---
id: TASK-531
title: The format check leaves the tracked third-party skills to their owners
status: Done
assignee: []
created_date: '2026-10-25T02:27:00Z'
updated_date: '2026-10-25T02:27:00Z'
labels: []
dependencies: []
ordinal: 929000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Since 96e6d3ebb tracks the third-party skills under .agents/skills/, `vp run format:check` reports 60 of their files and `bun run check` fails on main. The fmt configuration in vite.config.ts already ignores .claude/** because agent files retain their owners; .agents/** is missing beside it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `vp run format:check` passes on a checkout that tracks .agents/skills/
- [x] #2 No repository-authored file leaves the format check: skills/ is still checked
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
vite.config.ts ignores .agents/** in its fmt configuration beside .claude/**, so the format check leaves the tracked third-party skills to their owners. skills/ is still formatted. `vp run format:check` passes on 2980 files, where it reported 60 skill files before.
<!-- SECTION:FINAL_SUMMARY:END -->

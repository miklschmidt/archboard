---
id: TASK-541
title: The format check ignores the third-party skills under .agents
status: Done
assignee:
  - '@claude'
created_date: '2026-10-25T17:29:00Z'
updated_date: '2026-10-25T19:25:00Z'
labels:
  - tooling
dependencies: []
ordinal: 948000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Commit 96e6d3ebb tracked third-party agent skills under `.agents/skills/` beside their `.claude/skills/` copies. The formatter ignores `.claude/**` but not `.agents/**`, so `bun run check` stops at `format:check` on 60 upstream files and hides every later lane. The repository skills under `.agents/skills/` are symlinks into `skills/`, which the check still formats.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `bun run check` passes `format:check` without reformatting any third-party skill file
- [x] #2 The repository skills in `skills/` are still format-checked
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add `.agents/**` to `fmt.ignorePatterns` in vite.config.ts beside `.claude/**`. 2. Run `bunx vp run format:check` and `bun run check`.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The format check ignores .agents/**, so third-party skills are not reformatted, and skills/ is still checked. Verified by format:check passing in the full gate.
<!-- SECTION:FINAL_SUMMARY:END -->

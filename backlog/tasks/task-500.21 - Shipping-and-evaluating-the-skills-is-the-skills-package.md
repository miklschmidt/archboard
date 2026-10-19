---
id: TASK-500.21
title: Shipping and evaluating the skills is the skills package
status: To Do
assignee: []
created_date: '2026-10-19 11:10'
labels: []
dependencies:
  - TASK-500.14.04
parent_task_id: TASK-500
ordinal: 890000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
skills is layer 7: runtime/skill-distribution and runtime/skill-evaluation (14,549 lines). Skill evaluations are human-run: never start eval:skill run or grade, and never walk .skill-evals recursively (.claude/rules/agent-work.md).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 packages/skills holds runtime/skill-* in role folders with api files, the evals/coverage.json owner paths and the skill artifact scripts name the new locations
- [ ] #2 Its tests live in the package, outside code uses only its curated api interface files (docs/agents/boundaries.md), and the package graph, package api and browser-safety checks pass
- [ ] #3 bun run check passes
<!-- AC:END -->

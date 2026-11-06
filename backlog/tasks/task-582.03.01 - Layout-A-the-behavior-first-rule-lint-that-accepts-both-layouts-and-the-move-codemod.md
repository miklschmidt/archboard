---
id: TASK-582.03.01
title: >-
  Layout A: the behavior-first rule, lint that accepts both layouts, and the
  move codemod
status: To Do
assignee: []
created_date: '2026-11-06T19:06:00Z'
labels: []
dependencies: []
documentation:
  - backlog/docs/doc-003 - Behavior-first-layout-plan.md
parent_task_id: TASK-582.03
ordinal: 1029000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The layout moves hundreds of files across many commits, and every commit must keep bun run check green. So the rule, its tests and its lint must accept both layouts before any code moves, and one tool must move files, rewrite imports and update the vault the same way each time. Plan: doc-003, step A1 and A2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ADR 0075 records the behavior-first layout and amends ADR 0055; docs/agents/boundaries.md and docs/agents/frontend.md state it
- [ ] #2 workspace-layout.test.ts holds the new rule with a ratchet of trees still role-first, and fails if a listed tree has no role-first file left
- [ ] #3 Each lint rule that reads a role folder accepts both layouts and keeps its guarantee, proven by rule tests in both forms
- [ ] #4 A repository test fails when vite.config.ts names a test path that does not exist
- [ ] #5 scripts/move-source.ts moves a reviewed manifest with git mv, rewrites aliases, relative specifiers and repository-path literals, and updates bindings and anchors through archboard model edit; a dry run over apps/web changes nothing
<!-- AC:END -->

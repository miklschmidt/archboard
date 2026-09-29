---
id: TASK-367.14
title: Language servers resolve Python and C# candidates
status: To Do
assignee: []
created_date: '2026-09-29 01:15'
labels:
  - code-check
dependencies:
  - TASK-367.13
  - TASK-367.08
  - TASK-367.11
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 622000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Python and C# have mature language servers, but each needs its project found first: the environment of a Python project, and the solution or project file of a .NET one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A Python candidate resolves through pyright or basedpyright with the project's environment
- [ ] #2 A C# candidate resolves through csharp-ls or the Roslyn language server with the solution or project file
- [ ] #3 A missing server or project file is reported once, and the candidates stay
<!-- AC:END -->

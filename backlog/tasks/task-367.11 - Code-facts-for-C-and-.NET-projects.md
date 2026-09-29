---
id: TASK-367.11
title: Code facts for C# and .NET projects
status: To Do
assignee: []
created_date: '2026-09-29 01:15'
labels:
  - code-check
dependencies:
  - TASK-367.07
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 619000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In C#, the files of one project see each other without an import, and `using` names a namespace, not a file. File dependencies come from references to names that another file defines, and project dependencies come from the project files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Type and member references resolve by name within a project, including partial classes that span files
- [ ] #2 `ProjectReference` and `PackageReference` in `.csproj` files give project-level dependencies
- [ ] #3 Definitions carry their visibility: `public`, `internal`, `private`, and `InternalsVisibleTo`
- [ ] #4 The anchor, binding, undrawn and backwards checks work for parts bound to C# files or projects
<!-- AC:END -->

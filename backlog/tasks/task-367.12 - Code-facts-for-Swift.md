---
id: TASK-367.12
title: Code facts for Swift
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
ordinal: 620000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In Swift, `import` names a module, and the files of one module see each other without an import. File dependencies come from references to names that another file defines, and module dependencies come from `Package.swift`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Type and function references resolve by name within a module, including extensions that span files
- [ ] #2 `Package.swift` targets and their dependencies give module-level dependencies
- [ ] #3 Definitions carry their access level: `open`, `public`, `package`, `internal`, `fileprivate` or `private`
- [ ] #4 The anchor, binding, undrawn and backwards checks work for parts bound to Swift files or targets
<!-- AC:END -->

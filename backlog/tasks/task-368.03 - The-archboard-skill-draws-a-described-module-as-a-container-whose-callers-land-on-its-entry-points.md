---
id: TASK-368.03
title: >-
  The archboard skill draws a described module as a container whose callers land
  on its entry points
status: To Do
assignee: []
created_date: '2026-09-29 01:17'
labels:
  - interfaces
  - skill
dependencies:
  - TASK-368.01
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: high
type: enhancement
ordinal: 639000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The consumer skill binds a part to the file whose body runs, and lands a call on that body (evidence rule 3). So a board of a deep module draws its implementation as flat parts, and callers appear to reach into private files. The rule must change in portable terms: a caller outside a module lands on the entry point it names, and the calls behind that entry point are drawn inside the container.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Evidence rule 3 and the containment row of the catalogue say, in portable terms, that a board describing a module draws it as a container and that an outside caller lands on the entry point it names
- [ ] #2 One recipe's worked example about archboard's own source shows a container with entry points and hidden parts
- [ ] #3 The eval scenario and `coverage.json` row for the rule are updated, and shared guidance names no archboard subject
<!-- AC:END -->

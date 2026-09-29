---
id: TASK-367.03
title: Vault diagnostics name the part or relationship they are about
status: To Do
assignee: []
created_date: '2026-09-29 01:15'
labels:
  - code-check
  - cli
dependencies: []
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-367
priority: medium
type: feature
ordinal: 611000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A diagnostic says which file, board and variant it is about, but not which subject (`VaultDiagnosticSchema` in `src/shared/semantic-policy/index.ts`). The code check reports findings about one part or one relationship, and the canvas cannot mark a subject the diagnostic does not name. Some existing diagnostics are about one subject too, such as a missing binding path or a drill-down to an unknown board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A diagnostic can carry the kind and id of the subject it is about
- [ ] #2 Existing diagnostics about one node or relationship fill it in: missing binding path, drill-down checks, unknown vocabulary on a node or relationship
- [ ] #3 `archboard check` prints the subject's name beside the message, and its machine-readable answer carries the id
- [ ] #4 Generated schemas and the skill references are regenerated where the answer shape changed
<!-- AC:END -->

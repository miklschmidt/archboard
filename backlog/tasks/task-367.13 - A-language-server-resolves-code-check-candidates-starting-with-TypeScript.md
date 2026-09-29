---
id: TASK-367.13
title: 'A language server resolves code-check candidates, starting with TypeScript'
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
ordinal: 621000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Tree-sitter matches names, so two methods with one name give a false candidate. A language server resolves each candidate to its real definition. Servers are separate programs that a machine may not have, so the check must work without them and say so.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The check starts a language server over stdio, resolves each candidate with a definition request, and reports it as resolved or as a candidate
- [ ] #2 When the server is not installed, the check says so once and reports candidates
- [ ] #3 The server command for each language can be configured, and TypeScript works first
- [ ] #4 Every server the check started has stopped when the check returns
- [ ] #5 The added time on the dogfood vault is measured and recorded in the design note
<!-- AC:END -->

---
id: TASK-151
title: Adopt approved analysis policy outside the UI
status: To Do
assignee: []
created_date: '2026-09-05 12:28'
updated_date: '2026-09-05 13:58'
labels: []
dependencies: []
references:
  - TASK-150
  - docs/agents/strict-analysis.md
ordinal: 303000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-150 expanded into repository-wide strict-rule remediation before the UI rebuild. The user has now limited new enforcement to src/ui and requested that remaining source adoption be deferred. Preserve all corrections already made. Continue the remaining runtime, server, CLI, script, test and generated-source analysis work only in this later task, against the user-approved policy rather than the previously enabled full catalogue. TASK-150 UI delivery must not wait on this work.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Scope and applicable rules outside src/ui are explicitly reviewed against the then-current user-approved UI policy before source repair resumes.
- [ ] #2 Previously corrected behavior and contracts are preserved, and remaining findings are resolved without broad suppressions or concurrency changes made solely to satisfy lint.
- [ ] #3 Ordinary sequential lint/compiler checks and the cheapest relevant behavior checks verify the adopted scope with explicit test isolation.
<!-- AC:END -->

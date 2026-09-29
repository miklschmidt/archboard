---
id: TASK-369.05
title: >-
  An agent can map a branch onto a board and set it against the branch's
  proposal
status: To Do
assignee: []
created_date: '2026-09-29 01:19'
labels:
  - history
  - cli
  - skill
dependencies:
  - TASK-369.02
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-369
priority: medium
type: feature
ordinal: 653000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A reviewer wants to know which parts a change touched, and whether the proposal for the task said it would touch them. This is the architecture review beside the standards and spec reviews of the code-review skill. A pull request recording also needs it to choose its steps.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Given a base ref, the answer lists the parts whose bound files changed between the merge base and HEAD
- [ ] #2 Given a proposal, the answer splits the parts into named and changed, changed but not named, and named but not changed
- [ ] #3 The machine-readable answer has a schema, and the pull request recording recipe of the consumer skill uses it to choose the parts its steps are about
<!-- AC:END -->

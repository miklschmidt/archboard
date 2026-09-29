---
id: TASK-368.01
title: Decide how a container's interface is derived and what its measures are called
status: To Do
assignee: []
created_date: '2026-09-29 01:17'
labels:
  - interfaces
  - semantic-model
dependencies: []
documentation:
  - docs/design/design-checks.md
parent_task_id: TASK-368
priority: high
type: docs
ordinal: 637000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Proposal 2 of docs/design/design-checks.md derives a container's interface from reach: the children that relationships reach from outside it. Several questions need an answer first. What counts as outside, when containers nest? Does a relationship that ends on the container itself (allowed for a whole-module dependency) make an entry point? How does a pass-through entry point look on a board? The measures also need a name that is not "scorecard", which already means how readable a drawing is (CONTEXT.md).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 An ADR records the derivation: what counts as outside, how nesting and relationships to the container itself count, and what a pass-through entry point is
- [ ] #2 The ADR records that the interface is derived and never authored (ADR 0031), and how drafts, comparison and history use it
- [ ] #3 `CONTEXT.md` defines the new terms, each with an _Avoid_ line, and the measure name does not collide with Scorecard
- [ ] #4 The codebase-design vocabulary (module, interface, seam, depth) maps onto the terms, and the ADR says where they differ
<!-- AC:END -->

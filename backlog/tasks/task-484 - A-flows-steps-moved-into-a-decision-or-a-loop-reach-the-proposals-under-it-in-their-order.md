---
id: TASK-484
title: >-
  A flow's steps moved into a decision or a loop reach the proposals under it in
  their order
status: To Do
assignee: []
created_date: '2026-10-16 12:59'
labels:
  - semantic-boards
  - variants
dependencies: []
priority: medium
type: bug
ordinal: 849000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-10-16 an agent rewrote the flows of Device Trust Control Plane (github.com/Admin-By-Request/Docs-Architecture-Design), a board whose proposals stack twelve deep. When it moved a flow's existing steps into a new decision or loop on one variant, the merged copies of that flow on the drafts under it came out with their steps in a scrambled order. It repaired each descendant by restating the flow with an edit and settling the order disagreements with resolve --mine. Reconciliation should carry a moved step to its new place, or name a competing-order disagreement, rather than leave a draft with an order nobody wrote. Separately, on Platform Production Kubernetes Runtime a root flow naming a part that a proposal removed was held back from the proposal, and settling mine left it removed with no way to restore it by id; whether that is intended belongs here too.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Moving steps of an inherited flow into a decision or a loop on a variant leaves every draft under it with the same steps in the same order, or with a competing-order disagreement that names the flow
- [ ] #2 A test reproduces the scramble with a three-deep chain of drafts before the fix
<!-- AC:END -->

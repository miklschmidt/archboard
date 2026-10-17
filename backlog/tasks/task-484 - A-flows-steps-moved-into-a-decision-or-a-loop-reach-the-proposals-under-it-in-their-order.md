---
id: TASK-484
title: >-
  A flow's steps moved into a decision or a loop reach the proposals under it in
  their order
status: Done
assignee:
  - '@claude'
created_date: '2026-10-16 12:59'
updated_date: '2026-10-17 04:20'
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
- [x] #1 Moving steps of an inherited flow into a decision or a loop on a variant leaves every draft under it with the same steps in the same order, or with a competing-order disagreement that names the flow
- [x] #2 A test reproduces the scramble with a three-deep chain of drafts before the fix
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Test first: a store test (root, child, grandchild) moves two existing steps into a new decision and into a new loop on the root, with the child and grandchild each having changed something else, and asserts the nested order on both drafts; a third case asserts a competing-order issue naming the flow, and that answering it with mine is durable.
2. Fix in reconciliation: place a decision or loop the merge newly holds immediately before the first step it holds (flow-steps holdersFirst), then build the tree; when the tree's flat reading differs from the merged flat order, keep this proposal's steps and report one competing-order issue whose subject is the flow.
3. settle-order: find a step at any depth or the flow itself, and answer a flow's order by moving the base's steps to the predecessor's.
4. Gate: bun test --isolate on semantic-board, store and cli; lint; tsc; oxfmt.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: reconciliation merges a flow on its flat reading and then builds the tree back with nestedSteps. A decision or loop the predecessor added was placed only by what it followed there (in this proposal's order, before the shared order was dealt), and nestedSteps silently put a step whose holder came after it at the top of the flow, and pushed any step that stood between the held steps out after the holder. So a draft step added right before the moved steps landed after the new decision; steps moved into a loop placed after another step fell out of it; a decision placed after another step was even reported as left-empty.
Fix: holdersFirst (flow-steps.ts) puts each decision or loop the base did not have immediately before the first step it holds. toldFlow (new reconcile-flow.ts) builds the tree and, when the tree's flat reading differs from the merged flat list (a step one side put between steps the other side moved into a holder, or a step this proposal moved across the new holder), keeps this proposal's steps and reports one competing-order issue with subject = the flow, field steps, mine/theirs = each side's step outline by id; it replaces step-level order issues of that flow. settle-order: orderedIn finds a step at any depth or the flow itself, and an answered flow order moves the base's steps to the predecessor's whole tree (a walkthrough is still dealt), so a mine answer stays answered while another issue is open. ADR 0053 and skills/archboard/references/variants.md say so.
Tests: src/runtime/semantic-board-store/tests/propagation-flow-logic.test.ts (root, child, grandchild): decision case, loop case, and the competing-order case with a durable mine answer. All three failed before the fix.
Second question: a root flow naming a part the proposal removed is a reference-lost issue, and the flow is restorable by id with semantic edit without confirmation, because the direct predecessor holds it (checked with a scratch store run). Remaining gap, not fixed here: reference-lost holds back the whole merge (reconcile.ts returns states.mine), so resolve mine also drops every other change the predecessor made in that merge, for example a node rename in the same edit, and later merges never offer it again. That needs its own task.

Merged 2026-10-17 (f4adea865). Store and shared tests: 448 pass on the branch. Open, outside this task: a reference-lost merge keeps the draft's whole content, so resolve with mine drops the predecessor's other changes in that merge (recorded as TASK-490).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Steps moved into a new decision or loop reach every draft below in their order and nesting, or the draft gets one competing-order issue naming the flow, which a mine answer settles for good. Verified by propagation-flow-logic.test.ts (three-deep chain, decision and loop), which failed before the fix.
<!-- SECTION:FINAL_SUMMARY:END -->

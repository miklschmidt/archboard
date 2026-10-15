---
id: TASK-479
title: >-
  A part added to a variant after it was branched gets an order that its
  branches do not hold
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-15 17:00'
labels: []
dependencies: []
priority: medium
type: bug
ordinal: 844000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while drawing a stack of pull requests (TASK-478.04): the stack board starts with a base draft, proposals are branched from it, and later the base draft gains the existing parts that the change connects to. The parts added to the base got orders 1000 and 2000, which the parts of the branched proposal already held, so the change could not reach the branch. Reproduced on a throwaway vault: `semantic new R` as a draft, `semantic branch R --as child`, two parts edited into child, then two parts edited into the base. The write succeeds, and child holds two disagreements: "content.nodes.<id>.order: order 1000 is already used by <id>; choose another number". The author never chose an order: the store minted one that only the edited variant was checked against. Working around it took orders from 900000.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A part added to a variant gets an order that no variant branched from it holds, so the addition reaches every branch that has not changed it
- [ ] #2 An order the author states keeps today's refusal and disagreement behaviour
- [ ] #3 A test owner reproduces the sequence above: base draft, branch, parts in the branch, parts in the base, and the branch holds the base's parts with no disagreement
<!-- AC:END -->

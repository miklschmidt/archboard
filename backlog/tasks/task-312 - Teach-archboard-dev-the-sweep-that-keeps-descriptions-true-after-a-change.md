---
id: TASK-312
title: Teach archboard-dev the sweep that keeps descriptions true after a change
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 14:47'
updated_date: '2026-09-23 14:48'
labels:
  - skill
  - docs
dependencies: []
ordinal: 544000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-310 and TASK-311 found the product's descriptions weeks behind the code: glossary terms for removed concepts, help listing a refusal no route sends, INSTALL.md naming a directory that did not exist, the fork's environment names, a setup block telling other repositories that status prints the vault, an optional binding field one path ignored, and a machine-specific claim in a tracked document. The user (2026-09-23) asked for generalized changes to the archboard-dev skill so these do not go stale again.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The skill gives a procedure for removing, renaming or redefining anything a reader sees, with where to look, what to delete, how to retire a decision and which copies stay stale, each step with a completion condition
- [x] #2 The skill says where a fact must be stated so it cannot drift: option conditions in the contract, ARCHBOARD_ environment names with the old name refused, optional fields honoured by every reader, claims checked against code, no machine facts
- [x] #3 The two verification traps this session hit are among the facts that will mislead you
- [x] #4 The description names the new trigger
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard-dev now ends every removal, rename or redefinition with a four-step sweep (find every statement, delete what only served it, retire the decision, say which copies stay stale), states where a fact must live so it cannot drift, and lists the type-check colour trap and lint-is-not-the-compiler among the facts that mislead. The description names the new trigger. Each rule comes from a defect found in TASK-310 or TASK-311.
<!-- SECTION:FINAL_SUMMARY:END -->

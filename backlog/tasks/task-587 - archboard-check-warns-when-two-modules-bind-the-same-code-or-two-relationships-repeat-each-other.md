---
id: TASK-587
title: >-
  archboard check warns when two modules bind the same code or two relationships
  repeat each other
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T02:27:00Z'
updated_date: '2026-11-07T02:41:00Z'
labels:
  - model
  - check
dependencies:
  - TASK-585
ordinal: 1034000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
During the behavior-first layout (TASK-582.03), scratch scans found 18 pairs of modules that bound the same code and 24 groups of relationships with the same source, target and anchor. Each copy was a defect of the current state: it split one piece of code between two identities, or drew one dependency twice. They were fixed by hand, and nothing in `archboard check` catches a new one, so the model gate of `bun run check` (TASK-585) lets them back in. The code settles whether two modules are one, so a warning names the pair and leaves the merge to the author.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The semantics check warns on two modules of one state whose bindings name the same repository, path and symbol, and names both modules and the shared binding
- [x] #2 The semantics check warns on two relationships of one state with the same source, target and anchor, and names both relationships
- [x] #3 A binding that contains another (a folder and a file inside it), or two relationships with different anchors, raise no warning
- [x] #4 check semantics --help and the consumer skill name both codes and what to do about them
- [x] #5 archboard check on this repository vault reports neither warning, and bun run check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. packages/model/src/runtime/check/operations/duplicates.ts: BINDING_SHARED keys bound modules by repo, normalized path and symbol; RELATIONSHIP_REPEATED keys anchored relationships by from, to and anchor. Each warning sits on the later copy and names the first. structureDiagnostics runs them per state.
2. structure.test.ts: each warning and each quiet case.
3. check semantics --help and skills/archboard/references/authoring.md name both codes.
4. Verify: focused tests, archboard check on the vault, bun run check.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence: structure.test.ts 43 pass (9 new: each warning, its file and subject, and the quiet cases: folder and file inside it, two symbols of one file, file and symbol, two repositories, two anchors, two targets, no anchor). bin/archboard check semantics --help lists BINDING_SHARED and RELATIONSHIP_REPEATED. bun run check 22/22 with check:model reporting no warning on this vault. Sol review (gpt-6.1-sol, xhigh): APPROVE, no findings. PR #59.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
archboard check now warns with BINDING_SHARED on a module bound to the same repository, path and symbol as an earlier module, and with RELATIONSHIP_REPEATED on a relationship with the same source, target and anchor as an earlier one. Both name the earlier copy and leave the merge to the author, because the code decides which stays. The model gate of bun run check therefore keeps the duplicates that the layout removed from coming back. Verified by 9 focused tests, the vault check and the full gate; Sol approved.
<!-- SECTION:FINAL_SUMMARY:END -->

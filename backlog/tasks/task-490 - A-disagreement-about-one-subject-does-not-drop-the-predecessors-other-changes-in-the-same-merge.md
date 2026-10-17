---
id: TASK-490
title: >-
  A disagreement about one subject does not drop the predecessor's other changes
  in the same merge
status: To Do
assignee: []
created_date: '2026-10-17 04:20'
labels:
  - board-store
dependencies: []
priority: high
ordinal: 855000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found while fixing TASK-484 (2026-10-17). When a merge into a draft hits reference-lost, reconcile.ts keeps the draft content as it was (states.mine) for the whole variant, not only for the subject in dispute. Settling with resolve mine then also throws away every other change the predecessor made in that merge, and no later merge offers them again: in a throwaway run, a node rename in the same root edit never reached the child.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A predecessor edit that both renames a node and removes a part a draft refers to leaves the draft with the rename and one reference-lost issue, shown by a test
- [ ] #2 Settling that issue with mine keeps the rename
<!-- AC:END -->

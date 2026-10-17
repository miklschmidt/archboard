---
id: TASK-490
title: >-
  A disagreement about one subject does not drop the predecessor's other changes
  in the same merge
status: Done
assignee:
  - '@claude'
created_date: '2026-10-17 04:20'
updated_date: '2026-10-17 04:30'
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
- [x] #1 A predecessor edit that both renames a node and removes a part a draft refers to leaves the draft with the rename and one reference-lost issue, shown by a test
- [x] #2 Settling that issue with mine keeps the rename
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Tests first: a pure reconcileVariant case (root renames a node and removes one the draft's own relationship and flow refer to) and a store case on S -> A -> B (settle A with mine; the rename stays on A and reaches B).
2. Replace the whole-draft fallback in reconcileVariant with a search: hold back every subject the predecessor changed, then take each back one at a time (to a fixpoint) while the merged candidate stays coherent. The predecessor's held-back subjects are read as the base had them, so the merge itself keeps the draft's side for them.
3. Issues stay as they are: every non-reference issue of the full merge plus one reference-lost per canonical problem of the full candidate; resolve mine on them settles through the existing catch-up.
4. Update the reference-lost repair line and variants.md in plain English.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: reconcileVariant fell back to states.mine for the whole variant whenever the merged candidate was incoherent, so every other change in the same merge (a rename beside the removal) was dropped; settling with mine re-ran the same merge and kept the draft again, so nothing ever brought them back.
Fix: reconcile-candidate.ts coherentPart. Every top-level subject the predecessor changed since the base (node, relationship, flow, walkthrough, whole) starts held back, read as the base had it, which is the draft as it stands. Each is taken one at a time while the merge stays coherent, repeating until a pass takes nothing more, so only the subjects whose change breaks the board keep the draft's side. Issues are unchanged: the full merge's issues plus one reference-lost per canonical problem of the full candidate. resolve mine settles them through the existing catch-up, which now keeps the rest of the change.
Decision: whole flows and walkthroughs are the unit, so a removed step a beat refers to holds back that flow's other step changes too. Steps would need tree re-insertion into the predecessor's flow; deferred until a case needs it.
Decision: settle.ts subjectsFrom was the same operation as the new subjectsAsIn (content with named subjects as another content holds them), so settle now uses the shared helper.
Cost: the search runs only on an incoherent merge, one merge and one canonical check per changed subject per pass.
Tests: src/shared/semantic-board/tests/reconciliation.test.ts 'holds only the removal a relationship|flow here refers to, and takes the rest of the edit'; src/runtime/semantic-board-store/tests/propagation.test.ts 'a draft keeps the rest of an edit that removed what it refers to, settled or not' (S -> A -> B: rename plus one reference-lost on A, settle mine keeps the rename, A coherent, B takes the rename). Both failed on the old code (n1 stayed API).

Validation on feat/derived-overview after cherry-pick (395045f19): bun test --isolate src/shared/semantic-board src/runtime/semantic-board-store 451 pass 0 fail.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A merge that would lose a reference now holds back only the subjects whose change breaks the draft, so the predecessor's other changes in the same edit (a rename) arrive, and settling the reference-lost issue with mine keeps them. Verified by the reconciliation and propagation tests, which failed on the old code.
<!-- SECTION:FINAL_SUMMARY:END -->

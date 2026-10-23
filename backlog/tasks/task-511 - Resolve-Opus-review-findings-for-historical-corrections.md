---
id: TASK-511
title: Resolve Opus review findings for historical corrections
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-23 03:01'
updated_date: '2026-10-23 03:04'
labels: []
dependencies: []
ordinal: 918000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The requested Opus 5.5 high-effort review found a cancellation defect in historical correction code reads and documentation/schema ownership issues. Reviewers commit focused repairs and regression coverage.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Correction code reads cancel on server stop and leave the board unchanged.
- [ ] #2 Review findings are resolved or documented with the intended contract.
- [ ] #3 The complete repository gate passes after all reviewer commits.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Collect the seven scoped component and boundary reviews. Keep reviewer fixes in their owning modules. Resolve remaining concrete contract issues, run the complete gate, record review outcomes and commit. No architecture board is affected because these repairs preserve the existing correction components and relationships.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All seven Opus 5.5 reviews ran with effort high against e80b30e240a21abf66df5fbff7c0d71e3e0320d4...34c7739d8. Fixed: Git-reading cancellation on stop, empty correction provenance, invalid board address in suggestions, inconsistent variant refusals, undeclared expected CLI refusals, canonical commit spelling, schema ownership and stale authoring guidance. Added a stale-version-during-code-check regression. Keep NODE_UNCONNECTED on isolated drill-down nodes because TASK-508 requires every unconnected node. Historical checks intentionally report language-server skips for immutable trees; preview discloses them. Extra revision evidence remains allowed so unbound historical diagrams can be corrected. The approved no-descendant-change behavior remains until the user approves the proposed draft-inheritance change. A question is pending; no draft propagation change is implemented.
<!-- SECTION:NOTES:END -->

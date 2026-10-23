---
id: TASK-511
title: Resolve Opus review findings for historical corrections
status: Done
assignee:
  - '@codex'
created_date: '2026-10-23 03:01'
updated_date: '2026-10-23 03:53'
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
- [x] #1 Correction code reads cancel on server stop and leave the board unchanged.
- [x] #2 Review findings are resolved or documented with the intended contract.
- [x] #3 The complete repository gate passes after all reviewer commits.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Collect seven scoped Opus reviews and repair grounded findings in their owning modules. The user approved carrying historical corrections into inheriting drafts while preserving adopted/current/historical successors. Proposal: Board persistence@TASK-511 adds the correction call to existing draft propagation. Reuse propagateEdit with one family write, preserve draft-local changes and expose conflicts. Add focused inheritance/conflict coverage, update historical correction guidance, run the complete gate and code check, adopt the proposal, and commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
All seven Opus 5.5 reviews ran with effort high against e80b30e240a21abf66df5fbff7c0d71e3e0320d4...34c7739d8. Fixed: Git-reading cancellation on stop, empty correction provenance, invalid board address in suggestions, inconsistent variant refusals, undeclared expected CLI refusals, canonical commit spelling, schema ownership and stale authoring guidance. Added a stale-version-during-code-check regression. Keep NODE_UNCONNECTED on isolated drill-down nodes because TASK-508 requires every unconnected node. Historical checks intentionally report language-server skips for immutable trees; preview discloses them. Extra revision evidence remains allowed so unbound historical diagrams can be corrected. The approved no-descendant-change behavior remains until the user approves the proposed draft-inheritance change. A question is pending; no draft propagation change is implemented.

User approved updating inheriting drafts. This supersedes the prior no-descendant-change choice. Use existing propagation, which stops at current, historical and shelved successors.

Preview now reports all inheriting draft outcomes through reconciliation, including clean merges. The full gate exposed complexity7 in correct after the preview default branch. needsAttention now owns its empty default, so callers pass optional outcomes directly. Type-aware lint and10 route tests pass, preserving the max6 rule. Full gate rerun pending.

Complete bun run check passes:4890module,257system,136repository,19browser owners. Restart and plain check pass with no diagnostics. Proposal code check introduces no findings and clears the undrawn correction-to-propagation call. Footprint: Historical corrections namedAndChanged; Lifecycle transitions35f3f4b8c changes export formatting and the shared empty-edit guard without changing its responsibility; Propagate descendant edits named only as the new call target, so no target commit is needed. Adopted Board persistence@TASK-511 at version90. Post-adoption behind review: Archboard package roles, server code-check role, server historical routes, CLI historical command and board client remain accurate; repairs alter internal validation, cancellation, preview results and refusals. No new parts or relationships beyond the adopted propagation call. Renderer internals reviewed under TASK-512. README check lists16 stale assets; a Git-object hash comparison proves all16 already stale at session base e80b30e240a21abf66df5fbff7c0d71e3e0320d4. No asset first became stale in this work. Codex-dependent refresh commands remain readme:assets explainer pr-walkthrough newcomer ask.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Resolved Opus5.5 high review findings and implemented the approved inheritance change. Content corrections reconcile inheriting drafts in one checked write, preserve draft-local edits and stop at adopted successors. Preview names all affected drafts. Cancellation, immutable evidence, stale versions and domain refusals have regression coverage. All repository gates pass. Board persistence proposal adopted.
<!-- SECTION:FINAL_SUMMARY:END -->

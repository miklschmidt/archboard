---
id: TASK-277
title: >-
  Restore inherited node and relationship identities during ordinary proposal
  edits
status: Done
assignee:
  - '@codex'
created_date: '2026-09-19 11:34'
updated_date: '2026-09-19 11:50'
labels: []
dependencies: []
type: bug
ordinal: 491000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
An author repairing a proposal cannot restore an absent inherited relationship id, and can restore a removed node only while a deleted-and-changed disagreement is open. RELATIONSHIP_REPLACED recommends restoring the absent id but that edit is refused, preventing consolidation of duplicate proposal subjects.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 An ordinary edit restores absent inherited nodes and relationships under their existing identities, including a batch reconnecting their references.
- [x] #2 Unknown ids, sibling-only ids and wrong-kind ids are refused without writes; restoration retains atomic version and reconciliation behavior.
- [x] #3 Repair diagnostics and consumer guidance describe executable identity restoration, with focused regression and CLI evidence.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce absent inherited relationship and node restoration against an isolated board. 2. Resolve known inherited identities by subject kind and reuse ordinary edit placement; retain reconciliation settlement only for restored disagreements. 3. Verify restoration, invalid ids, atomicity and CLI repair; update guidance and evaluation evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Confirmed the blocker with a deterministic branch/remove/restore relationship regression: UNKNOWN_EDGE before the fix. Authorize absent identities by kind from the direct predecessor and recorded reconciliation base, retaining same-batch removal/restatement refusals. Ordinary restoration only settles matching deleted-and-changed issues; other standings stay visible. CLI regression repairs copied nodes and edges, reconnects the existing flow and restores the shared view selection in one persisted version. Focused store suite: 36 passed; CLI: 2 passed; skill-evaluation/install targets: 237 passed. Focused lint clean. Full repository gate and commit owned by parent task.

Complete bun run check passed after correcting strict typing in the new fixture assertion. Repair implementation and tests are stable; later renderer-rule investigation is separate.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Ordinary edits restore absent node and edge IDs from the direct predecessor or recorded reconciliation base, keeping atomic writes and kind/identity validation. Fixed misleading duplicate-repair notices and documented the executable repair. Verified 36 store cases, 2 real CLI cases, skill/install checks and the complete repository gate.
<!-- SECTION:FINAL_SUMMARY:END -->

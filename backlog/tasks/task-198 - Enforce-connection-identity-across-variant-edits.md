---
id: TASK-198
title: Enforce connection identity across variant edits
status: Done
assignee:
  - '@codex'
created_date: '2026-09-13 11:01'
updated_date: '2026-09-13 11:09'
labels: []
dependencies: []
ordinal: 357000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reusing an edge ID after changing multiple properties hides a removed connection and falsely presents its replacement as a continuation. Agents need deterministic refusal from the shared write boundary, including changes split across edits.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Retained edge IDs with two or more changed authored properties relative to the direct predecessor are rejected with replacement guidance and no persisted changes.
- [x] #2 Zero or one changed property, normalized endpoint references, and explicit remove/add replacements remain valid.
- [x] #3 Regression coverage verifies sequential edits and the shared CLI write path; skill documents the enforcement.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Inspect the common candidate validation seam; validate completed family before persistence; add focused runtime and CLI coverage; sync skill wording and run the complete gate.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a schema-derived authored-field check after candidate normalization at the common write boundary, retaining readable older boards for repair. Counts emphasis independently of architecture-badge comparison. Focused store suite:103 pass; real CLI regression:1 pass. Audited 11 dogfood boards, repaired the one prior violation in Semantic renderer draft (label+emphasis) through one CLI batch and added replacement handle to shared view selection. Version5→6; predecessor unchanged; removed/added standings verified. New server restarted at3001; baseline server untouched.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shared semantic-board writes now refuse a retained edge ID when at least two normalized authored properties differ from its direct predecessor, including successive edits. Errors name the edge, variant and changed fields and explain removeEdges plus an ID-free replacement. Skill synced; one dogfood violation repaired without changing its predecessor. Full bun run check passed:2824 module,155 system,8 repository,15 browser tests;3002 total,0 failures. Running new-renderer server at3001 restarted with enforcement.
<!-- SECTION:FINAL_SUMMARY:END -->

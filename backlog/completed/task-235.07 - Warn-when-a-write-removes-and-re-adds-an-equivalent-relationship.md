---
id: TASK-235.07
title: Warn when a write removes and re-adds an equivalent relationship
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 18:51'
updated_date: '2026-09-15 19:37'
labels: []
dependencies: []
references:
  - src/runtime/semantic-board-store
  - TASK-235
parent_task_id: TASK-235
ordinal: 402000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Follow-up to the guardrail: the product could tell an author at write time that a batch removed a relationship and added one with the same endpoints and kind, since the loud rules teach themselves and a guardrail only catches it in evaluation. Not started; needs a decision on whether this is a warning on the write answer or a refusal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A write whose batch removes a relationship and adds one with the same from, to and kind answers with a warning naming both ids
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. replaced-relationships.ts decides the notice from before, removed ids and after. 2. editContent returns notices; the edit transition carries them; the write boundary turns them into VaultDiagnostic warnings on the applied result. 3. The server write answer concatenates them with the read-back warnings; the CLI already prints warnings.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decision: a warning, not a refusal: the board is valid and the agent may have meant a replacement; the message names the restatement that keeps the id. Tests in edge-identity.test.ts cover the one-property re-add (warning), two properties (none) and other ends (none). Store, server and CLI suites 313 pass; lint, type-check and fmt clean. authoring.md names the code.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A write that removes and re-adds an equivalent relationship answers with a RELATIONSHIP_REPLACED warning naming both ids; verified by the store tests.
<!-- SECTION:FINAL_SUMMARY:END -->

---
id: TASK-285
title: Author stable layout order for architecture subjects
status: Done
assignee:
  - '@codex'
created_date: '2026-09-19 23:59'
updated_date: '2026-09-20 01:11'
labels:
  - renderer
  - layout
dependencies: []
priority: high
type: bug
ordinal: 499000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Cloud Infrastructure Platform API Migration reoriented after a continuing relationship received a new ID. A controlled replay showed an ID-only change moved 15 of 18 cards because Graphviz input was sorted by ID. Nodes and relationships now need persistent numeric order so agents can deliberately change layout. Missing order on existing boards must be assigned from each document array position (1000, 2000, ...) and immediately persisted on read through the first versioned store migration. Subject IDs must not decide placement, routing, or paint ties.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Every node and relationship persists a numeric order; omitted order is assigned automatically in 1000 increments, while restating an existing ID retains its order.
- [x] #2 A versioned migration converts existing boards on read using each variant array position and atomically persists the result without changing subject IDs or losing concurrent writes.
- [x] #3 Renderer placement, routing, labels and painting use authored order instead of subject IDs; ID-only restatement keeps surviving card placement.
- [x] #4 Agents can set order through semantic edit and inspect it through board reads; the consumer skill documents the workflow.
- [x] #5 Focused real-board regression and complete check pass; migration and renderer behavior are verified.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add canonical numeric order to nodes and relationships, with input omission allowed and stable order retained on same-ID edits. 2. Introduce a versioned 2.2-to-2.3 migration at the store read boundary, assigning 1000-spaced positions from each variant array and atomically persisting under the board lease. 3. Replace renderer ID sorting and tie breaks with authored order, and update conflicting tests. 4. Document the edit workflow and verify on the Cloud Infrastructure board, run checks, simplify, then commit.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified semantic input assigns and retains numeric order, and the 2.2-to-2.3 store migration writes 1000-spaced order from each variant array under the board lease. Migration, CLI, renderer identity/order, and browser cases pass. Cloud Infrastructure draft renders with the continuing relationship. Clean integrated commit 8f19abc0 passed bun run check in an isolated worktree, including modules, system, repository, and serial browser.
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-09-20 00:05
---
User expanded scope from the confirmed edge input sort to all renderer ordering based on subject IDs; edit identity policy remains a separate task.
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added persistent authored order to nodes and relationships, a versioned read-time migration that atomically persists existing boards, and order-based renderer placement, routing, labels, and painting. Verified the real Cloud Infrastructure board and full clean gate.
<!-- SECTION:FINAL_SUMMARY:END -->

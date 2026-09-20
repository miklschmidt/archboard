---
id: TASK-285
title: Author stable layout order for architecture subjects
status: In Progress
assignee:
  - '@codex'
created_date: '2026-09-19 23:59'
updated_date: '2026-09-20 00:12'
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
- [ ] #1 Every node and relationship persists a numeric order; omitted order is assigned automatically in 1000 increments, while restating an existing ID retains its order.
- [ ] #2 A versioned migration converts existing boards on read using each variant array position and atomically persists the result without changing subject IDs or losing concurrent writes.
- [ ] #3 Renderer placement, routing, labels and painting use authored order instead of subject IDs; ID-only restatement keeps surviving card placement.
- [ ] #4 Agents can set order through semantic edit and inspect it through board reads; the consumer skill documents the workflow.
- [ ] #5 Focused real-board regression and complete check pass; migration and renderer behavior are verified.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add canonical numeric order to nodes and relationships, with input omission allowed and stable order retained on same-ID edits. 2. Introduce a versioned 2.2-to-2.3 migration at the store read boundary, assigning 1000-spaced positions from each variant array and atomically persisting under the board lease. 3. Replace renderer ID sorting and tie breaks with authored order, and update conflicting tests. 4. Document the edit workflow and verify on the Cloud Infrastructure board, run checks, simplify, then commit.
<!-- SECTION:PLAN:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @codex
created: 2026-09-20 00:05
---
User expanded scope from the confirmed edge input sort to all renderer ordering based on subject IDs; edit identity policy remains a separate task.
---
<!-- COMMENTS:END -->

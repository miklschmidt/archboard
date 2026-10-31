---
id: TASK-559.33
title: Remove the last relationship ends on frames
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T20:03:00Z'
updated_date: '2026-10-31T20:21:00Z'
labels: []
dependencies: []
parent_task_id: TASK-559
ordinal: 1005000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner, on 2026-10-31: connections that reach a container header are always a bug or badly authored data. 335 relationships in 69 containers end on a module with parts. Each must end on the part that owns it, with no copied relationships and no import map.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No relationship ends on a module that has parts, apart from one that joins a module to a part it holds
- [ ] #2 archboard check fails on a relationship that ends on a module with parts
- [ ] #3 Relationship count does not rise
- [ ] #4 Measures recorded before and after
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move RELATIONSHIP_ON_CONTAINER to the semantics check as an error, with the exception for a module and a part it holds. 2. Change RELATIONSHIP_UNDRAWN so a relationship counts for the two sides where its ends meet, because a holder can no longer carry a line. 3. Plan each end from the anchored code: an existing part first, else a new part named for its responsibility. Merge only relationships with the same kind, the same ends and the same meaning, and pay for each new sibling relationship with a merge. 4. Dry-run the plan on the vault files and measure check and fit. 5. Replay through model claim, edit and release, with the identities kept. 6. Update the skill, CONTEXT.md, the reader redesign and ADRs 0044, 0046 and 0070. 7. Run the full gate and record the measures.
<!-- SECTION:PLAN:END -->

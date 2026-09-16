---
id: TASK-243.06
title: >-
  Give the read route its own recipe and make the edit route read authoring only
  when it needs it
status: Done
assignee:
  - '@claude'
created_date: '2026-09-16 02:26'
updated_date: '2026-09-16 02:36'
labels: []
dependencies: []
parent_task_id: TASK-243
ordinal: 420000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The candidate costs more on small tasks because its routes pull the 15k-character authoring reference: S09, a read-only group inspection, rose 47% because the routing table sends "answer a question and change nothing" to authoring.md; S10, a three-property traffic edit, doubled because edit.md ends by pointing at authoring.md for everything and authors read it whole. One S12 run grepped the skill for view scopes because the propose-compare recipe never points at the views reference when a proposal adds views. A short read recipe and conditional pointers keep each route at SKILL.md plus one targeted reference.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A references/read.md recipe of under 40 lines covers `semantic show`, `semantic inspect --group` and what the answer reports, the routing table sends the read row to it, and S09 in evals.json names it as guidance
- [x] #2 The edit recipe points at authoring only for removals, bindings with revision evidence, groups and refusals, and the propose-compare recipe points at the views reference when the proposal adds or changes a view
- [x] #3 bun run eval:skill check passes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Write references/read.md (<40 lines): semantic show for the family and a view's scope, semantic inspect --group for members/internal/boundary/neighbours, what the answer reports, change nothing. 2. SKILL.md: route the read row to it; add it to When to read more. 3. edit.md tail: read authoring only for removals, bindings with revision, groups, refusals. 4. propose-compare.md: point at the views reference when a proposal adds or changes a view. 5. evals.json S09 guidance -> references/read.md; archboard-dev and preservation-assessment name the fifth recipe. 6. eval:skill check, fmt, sync.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
references/read.md is 29 lines; SKILL.md routes the read row to it and lists it under When to read more (five workflows); edit.md reads authoring only for removals beyond removeEdges, revision bindings, groups, drill-down, refusals; propose-compare.md points at the views reference when a proposal touches a view; evals.json S09 guidance is references/read.md; archboard-dev and the preservation assessment name the fifth recipe. eval:skill check ok; bun run check exit 0; skills synced.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Gave the read route a 29-line recipe and made the edit and propose pointers conditional; verified by eval:skill check, bun run check and sync.
<!-- SECTION:FINAL_SUMMARY:END -->

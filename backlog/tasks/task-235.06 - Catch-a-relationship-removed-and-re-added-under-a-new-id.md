---
id: TASK-235.06
title: Catch a relationship removed and re-added under a new id
status: Done
assignee:
  - '@claude'
created_date: '2026-09-15 18:51'
updated_date: '2026-09-15 19:07'
labels: []
dependencies: []
references:
  - src/runtime/skill-evaluation/lib/guardrails.ts
  - skills/archboard/SKILL.md
  - docs/design/server-is-the-truth.md
parent_task_id: TASK-235
ordinal: 401000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Candidate S05 rep 3 sent removeEdges for all seven seeded edges and re-added equivalents (same from, to, kind, label) without ids to put traffic on them, so every relationship got a fresh id. That is the identity break the never-rename-an-id invariant exists to prevent, and the ids-stable guardrail passed because it compares nodes only. The skill says a relationship is referenced by id and that one changed property keeps the id, but it never says outright that restating a relationship without its id creates a new one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ids-stable also fails when a relationship present before the run is gone by id and a relationship with the same endpoints and kind exists after under a new id with at most one other authored property changed
- [x] #2 A focused guardrail test covers the re-added edge, a genuine replacement (two or more properties changed) and an untouched edge
- [x] #3 SKILL.md says that changing a property of an existing relationship means restating it with its id, and that a restatement without the id is a new relationship
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ids-stable compares relationships by endpoint names and kind and flags a removed-and-re-added one with at most one other authored property changed (label, description, emphasis, effective traffic). Tests in outcomes-family.test.ts cover the re-added edge, a two-property replacement and an untouched edge. SKILL.md References and authoring.md Relationships say a relationship restated without its id is new. A CLI-time warning is TASK-235.07, not started.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The guardrail catches the S05 rep 3 identity break and the skill says how to change a relationship property; verified by the guardrail tests.
<!-- SECTION:FINAL_SUMMARY:END -->

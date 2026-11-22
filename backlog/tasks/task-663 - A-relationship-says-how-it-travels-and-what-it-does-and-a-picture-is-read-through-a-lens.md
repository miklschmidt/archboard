---
id: TASK-663
title: >-
  A relationship says how it travels and what it does, and a picture is read
  through a lens
status: To Do
assignee: []
created_date: '2026-11-22T03:38:00Z'
updated_date: '2026-11-22T12:58:00Z'
labels: []
dependencies: []
ordinal: 1144000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Pictures of many modules are unreadable: this model's 1328 relationships are 78% plain calls and 12% dependencies, and a reader asks one question at a time (how does traffic flow, where does state change, what depends on what). The owner decided (2026-11-22) that every relationship states its kind (how it travels, drawn as its color) and its effect (mutation, query or compute, drawn as its line type), that no relationship stays unclassified, and that a picture is read through a lens, a named question that chooses which lines draw and says how many it left out. The settled design, with every decision and its reason: artifacts/depth-gate/settled-effect.md and settled-lens.md (ignored; summarised in the subtasks), owner-decisions.md items 20 to 28.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every subtask is Done
- [ ] #2 This repository's model states a kind and an effect on every relationship, and its pictures read through the default lens are compared with the old ones in the pull request
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Owner chose 2026-11-22: a reading that names no lens reads through all where the default lens would draw no line, and the legend says the default draws none there. A named lens never gives way. ADR 0095 records it.
<!-- SECTION:NOTES:END -->

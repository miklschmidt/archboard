---
id: TASK-663.12
title: This repository's relationships are sync or async, and the records teach them
status: To Do
assignee: []
created_date: '2026-11-22T14:12:00Z'
labels:
  - feature
dependencies: []
parent_task_id: TASK-663
ordinal: 1158000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The vault holds 1,027 call relationships, and the ADRs, glossary, design rules and skill still teach call (spec section 7).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No relationship in .archboard/vault has kind call
- [ ] #2 Each relationship's sync or async kind agrees with its anchored call site, or its note says why
- [ ] #3 ADR 0094 and 0095, CONTEXT.md, DESIGN.md and the archboard skill references describe sync, async, the decoration, the joining rule, hideEffects and the lenses
- [ ] #4 archboard check reports no new warning
<!-- AC:END -->

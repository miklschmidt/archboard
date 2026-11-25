---
id: TASK-660
title: A factory that returns many function members counts them as names
status: To Do
assignee: []
created_date: '2026-11-22T01:58:00Z'
labels:
  - code-check
  - module-depth
dependencies:
  - TASK-659
references:
  - docs/adr/0082-the-code-check-judges-module-depth-from-the-code.md
priority: medium
type: enhancement
ordinal: 1114000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Types count no width, so an exported factory whose result carries many function members counts one name, though callers learn every member: `createCodeCheck()` returns `fileOwners`, `run` and more, and TASK-653.12 folded helpers into the members of `createCodexBrowserModel()`. A class by another spelling hides its width this way. ADR 0082 records this as a known limit of the depth gate (TASK-659) with the rule it would take: count the function-valued members of the object an exported function returns as the public methods of an exported class are counted. It moves widths across the repository (about 200 `create…` functions under packages/), so it needs its own run against the corpus.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The function-valued members of the object an exported TypeScript function returns count toward the module width as the public methods of an exported class do
- [ ] #2 A factory whose result holds only data members still counts one name
- [ ] #3 A run against this repository lists each module whose width or verdict the rule changes, before the rule lands
- [ ] #4 ADR 0082 no longer lists factories as a known limit
<!-- AC:END -->

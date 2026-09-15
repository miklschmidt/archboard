---
id: TASK-241
title: >-
  Layout rule hygiene: cycle breaking test, face tie-break test, bridging in the
  layout owner
status: To Do
assignee: []
created_date: '2026-09-15 21:27'
labels:
  - renderer
dependencies: []
references:
  - docs/design/layout-rules.md
ordinal: 412000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/design/layout-rules.md recommendation 7: cycle breaking in rank.ts has no direct test; previousSides breaks face ties by array order with no test; bridging runs in the painter so layoutCompound returns curves that are not the painted ones.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A rank test holds which edge of a cycle is dropped and that document order decides it
- [ ] #2 A test holds the previousSides tie-break
- [ ] #3 layoutCompound returns the bridged curves the painter draws
<!-- AC:END -->

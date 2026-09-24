---
id: TASK-327
title: >-
  The dogfood boards describe the renderer layout, edge identity and change fit
  as the code has them now
status: To Do
assignee: []
created_date: '2026-09-24 01:48'
labels:
  - architecture
dependencies: []
priority: low
type: docs
ordinal: 562000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
archboard check on the dogfood vault (2026-09-24) warns about five bindings to files that refactors removed, so those nodes describe code that no longer exists: Renderer layout's Reading choice, Flank rules and Scorecard (removed when the renderer adopted Graphviz placement and native routing, 260ffd3f), Board persistence's Edge identity (e438c312, preserve continuing relationship IDs) and Board viewer's Fit what changed (777870b8, fit selected view when switching variants). Where each concern lives now has to be read from the source; the Renderer layout board may need its layout story redrawn, not only rebound.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 archboard check on the dogfood vault reports no missing binding
- [ ] #2 Each of the five nodes is rebound to the code that does its job now, redrawn to match that code, or removed with its relationships and walkthrough references
<!-- AC:END -->

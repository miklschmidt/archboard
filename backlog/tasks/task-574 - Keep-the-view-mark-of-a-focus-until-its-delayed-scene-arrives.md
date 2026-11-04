---
id: TASK-574
title: Keep the view mark of a focus until its delayed scene arrives
status: To Do
assignee: []
created_date: '2026-11-04T15:57:00Z'
labels:
  - bug
dependencies: []
references:
  - https://github.com/miklschmidt/archboard/pull/39
ordinal: 1019000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A view gesture on an architecture reading (Focus, open a module) marks "view" at once, but the reported reading follows the accepted scene, which arrives after layout. If the person picks a subject before that scene is accepted, the pick report differs in selection only, and user-marks.ts deletes the unused "view" mark. The report that then carries the new view names nobody, so the voice coordinator is not told the person changed the view. PR 39 fixed the reverse order (a pick waiting in the debounce before the view gesture) and CodeRabbit named this one there. Keeping the mark until the view changes is not a fix: it would credit the person for a later view change by an agent (ADR 0034, test "a gesture that changed nothing does not wait for a change somebody else makes").
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A focus followed by a pick before the focused scene is accepted reports byUser "view" on the report that first shows the new focus
- [ ] #2 A view gesture that asks for the view already shown still credits nobody when a later agent change moves the view
- [ ] #3 A unit test owns each of the two orders
<!-- AC:END -->

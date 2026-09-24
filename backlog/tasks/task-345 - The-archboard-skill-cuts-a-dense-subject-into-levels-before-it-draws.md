---
id: TASK-345
title: The archboard skill cuts a dense subject into levels before it draws
status: To Do
assignee: []
created_date: '2026-09-24 22:39'
labels:
  - skill
dependencies: []
priority: high
type: enhancement
ordinal: 586000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User review 2026-09-25: the Archboard server board puts 22 cards and 49 labelled relationships on one level, seven of them route handlers, and three hubs (Agent CLI 7 out, Pane registry 7 in, Semantic board store 7 in) carry most of the lines. It is slow to lay out and hard to read, and the user judged that collapsing the routes into one card with a drill-down 'seems like the way it should have been done from the start', which makes it an archboard skill issue: the skill teaches levels and drill-downs (TASK-156) and groups (TASK-235.08) but nothing made the author notice that the subject had outgrown one level. Skill evaluations are human-run: never start eval:skill run or grade.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The archboard skill tells an author when one board holds more than a reader can take in at one level and how to cut it: a set of like parts becomes one card with a drillDown into a board of its own, and the rest stays on the level above
- [ ] #2 The rule is stated in the skill's own vocabulary without examples drawn from skill evaluations, and describes archboard or a generic subject
- [ ] #3 The dogfood Archboard server board is remodelled by that rule: its route handlers move to a linked routes board reached by drillDown, and both boards are rendered and looked at
<!-- AC:END -->

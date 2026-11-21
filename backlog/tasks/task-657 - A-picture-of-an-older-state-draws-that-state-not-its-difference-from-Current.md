---
id: TASK-657
title: A picture of an older state draws that state, not its difference from Current
status: To Do
assignee: []
created_date: '2026-11-21T04:36:00Z'
labels: []
dependencies: []
ordinal: 1140000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rendering a state that is older than Current by its id (`archboard model rasterize --state LzXvT7U7 --scope "vKEsyHFk#EuaJBisP"` in this repository, where LzXvT7U7 was Current before the deepening redesign sL6y1FLr was adopted) compares it against Current. The picture then draws every package that Current added since (model-contract, ui-clocks, machine and others) as a "Removed" ghost, which reads backwards, and it grows to 9368 x 9445 px, past the 80-megapixel export limit. A reader who asks for a picture of how the architecture was, for a pull request or a history view, gets a wrong picture. Found while drawing the before and after pictures of PR #142. Read the ADRs on readings and comparisons first: the fix must say what an older state compares against by default (its own predecessor, or nothing) and keep a proposal comparing against its predecessor as today.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Rendering an older retained state by id with no comparison option draws that state without marking Current-only modules as removed, in every surface that renders a state by id (CLI rasterize and render, the server route, the browser reading)
- [ ] #2 An explicit comparison (--against or the reading option) still draws exactly what it asks for
- [ ] #3 A proposal still compares against its predecessor by default
- [ ] #4 A focused test reproduces the backwards marks with a small vault of two states and fails without the fix
- [ ] #5 The CLI help and the archboard skill say what an older state compares against by default
<!-- AC:END -->

---
id: TASK-339
title: 'Traffic reads as flow: marks that show their direction, even at rest'
status: To Do
assignee: []
created_date: '2026-09-24 14:01'
labels:
  - renderer
dependencies: []
priority: medium
type: feature
ordinal: 580000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User request 2026-09-24: the traffic visualization is plain round dots riding the line, and the user asked for something better ('let me see you flex your skills and do something cool'). The same dots also make a junction mark (TASK-337) hard to tell apart. A round dot says nothing about direction, which matters most in a still picture, where the marks are drawn at rest. ADR 0027 keeps its contract: speed in diagram units per second, volume in marks per second, marks already spread along the route at load, none for removed relationships or reduced-motion readers, animation kept in exported SVG.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A traffic mark shows which way its relationship flows, in a still picture as well as in motion
- [ ] #2 ADR 0027's rates hold: equal speed on short and long routes, marks entering at the volume, spread along the route at load
- [ ] #3 Removed relationships and reduced-motion readers show no traffic marks
- [ ] #4 A sequence's timed marks share the same visual language
- [ ] #5 Before and after pictures of every view of every dogfood board are shown to the user
<!-- AC:END -->

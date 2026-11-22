---
id: TASK-669
title: >-
  A picture shows where the architecture may cause bottlenecks, so a reader can
  reason about a redesign
status: To Do
assignee: []
created_date: '2026-11-22T14:12:00Z'
updated_date: '2026-11-22T14:18:00Z'
labels:
  - feature
dependencies: []
ordinal: 1162000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-11-22: "I don't want the architecture diagram to tell me what's slow (that's not what a diagram is for), i want it to give me an idea of where the architecture may cause bottlenecks." A diagram gives a person enough of the architecture to use their intuition: where work funnels through one part, where a caller waits on a chain of sync work, where one part fans out to many. The aim is the "Oh! What if we did X, couldn't we then simplify Y and get rid of Z entirely?" moment. No measured timings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The reader questions that point at architectural bottlenecks are named, with the evidence a picture already holds for each, such as fan-in, fan-out, chains of sync work and serial waits
- [ ] #2 A picture or lens makes each one visible without measured timings
- [ ] #3 Screenshots of this repository show at least one such spot a reader can reason about
<!-- AC:END -->

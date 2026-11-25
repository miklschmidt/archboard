---
id: TASK-662
title: model render and model rasterize name their comparison
status: To Do
assignee: []
created_date: '2026-11-22T02:40:00Z'
labels: []
dependencies: []
ordinal: 1143000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A picture of a state is read against Current by default (ADR 0023, ADR 0032), and the owner keeps that default (TASK-657). The CLI cannot draw an older state plainly or against a chosen state: render and rasterize have no option for it, so an agent cannot make the plain "before" picture a pull request needs, while the browser already offers "No comparison". The old picture commands had this pair before the canonical-model rewrite dropped it; the store still resolves both. Settled by the advisors: `--against <id|name>` as in `model compare`, and a value-less `--no-comparison`, since any reserved value could collide with a free-text state name. `model compare` is unchanged: its plain form is `model read`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `model render` and `model rasterize` take `--against <id|name>` with the same help line and resolution as `model compare`
- [ ] #2 `--no-comparison` draws the state with no comparison marks and no removed subjects
- [ ] #3 Passing both options is refused with an error that names both
- [ ] #4 With neither option, a picture compares exactly as today
- [ ] #5 The archboard skill names both options where it describes before and after pictures
<!-- AC:END -->

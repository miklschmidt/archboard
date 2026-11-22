---
id: TASK-672
title: Delete the Track layout engine
status: To Do
assignee: []
created_date: '2026-11-22T18:55:00Z'
labels:
  - refactor
dependencies: []
ordinal: 1154000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Owner, 2026-11-22: "I really want to delete the track renderer, i am tired of agents spending time on it, it sucks so much and should never be used." Blocks has been the default since ADR 0064; Track stays behind --layout track, and agents keep spending time keeping its readings and corpus tests green. Removing it leaves one layout engine to maintain and judge.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No Track layout code remains in crates/ or packages/, and the engine choice has one engine
- [ ] #2 --layout track, any engine setting or address that names track, and the layout engine switch in the reader are gone, or refused with a message naming Blocks where old input may still say track
- [ ] #3 Tests that ran both engines run Blocks only; Track-only tests are deleted; no Blocks check is weakened
- [ ] #4 An ADR records the removal and amends ADR 0040 and 0064; docs, skills and the site name no Track engine
- [ ] #5 types, lint, format, Rust and the renderer, model and browser tests pass, and archboard check reports no new warning
<!-- AC:END -->

---
id: TASK-341
title: The browser draws every board ahead of time when the application loads
status: To Do
assignee: []
created_date: '2026-09-24 16:09'
labels:
  - ui
  - renderer
dependencies: []
priority: high
type: feature
ordinal: 582000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User report 2026-09-24: after the renderer build changed, every kept picture was stale and each board was drawn only when somebody opened it, which on this vault takes up to minutes for one board. The browser draws ahead only when the server announces a board changed (src/ui/semantic-board-canvas/lib/local-pictures.ts, 'Drawing ahead'), never at load, so a new build or a cleared cache leaves every board to be drawn on the click. The user expects boards to be drawn in the background when the application loads.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When the application loads, every listed board whose kept picture is missing or stale for its current version, the vault policy and the renderer build is drawn in the background, one at a time, without holding up the board on screen
- [ ] #2 Opening a board drawn ahead shows its kept picture without laying it out again
- [ ] #3 A board somebody opens while the background drawing runs is drawn first
- [ ] #4 One test owner proves drawing ahead at load
<!-- AC:END -->

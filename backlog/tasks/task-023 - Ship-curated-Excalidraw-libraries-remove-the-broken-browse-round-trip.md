---
id: TASK-023
title: Ship curated Excalidraw libraries; remove the broken browse round-trip
status: To Do
assignee: []
created_date: '2026-08-19 21:21'
updated_date: '2026-08-19 21:22'
labels:
  - needs-triage
  - ready-for-agent
dependencies: []
ordinal: 23000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The seven curated libraries ship with the app and need no network fetch
- [ ] #2 The #addLibrary= round-trip works: Add to Excalidraw on libraries.excalidraw.com lands the library in archboard
- [ ] #3 An added library persists — it is not lost on reload
- [ ] #4 Library items remain usable by drag-and-drop onto a board
- [ ] #5 Attribution to the library authors is retained somewhere durable
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-08-19 21:22
---
User chose fixing the round-trip over removing the button: 'the add to excalidraw button doesn't work' was the complaint, and making it work means any library found later needs no code change.

Also from the user, on bundling: 'I don't care about bundle size, this is an app, not a website.' So vendoring the .excalidrawlib files into the build is fine — 1.2MB across seven, 111 items.

The seven are already vendored at frontend/libraries/.
---
<!-- COMMENTS:END -->

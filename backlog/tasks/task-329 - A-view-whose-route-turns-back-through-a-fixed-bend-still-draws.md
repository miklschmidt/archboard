---
id: TASK-329
title: A view whose route turns back through a fixed bend still draws
status: To Do
assignee: []
created_date: '2026-09-24 13:37'
labels:
  - renderer
dependencies: []
priority: high
type: bug
ordinal: 570000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found by TASK-328 while drawing every view of the dogfood vault: `./bin/dogfood semantic rasterize "Voice coordinator" --view "Workhorse news"` fails every time with 'Layout relationship eRYh0zYO: Route run 6 reverses through a fixed bend' (src/transformers/semantic-renderer/lib/layout/curves.ts, reversesBend). The board is valid (./bin/dogfood check reports nothing) and the whole board draws; only this view fails, so a person opening it in the browser gets the error instead of a picture. The other 33 views of the vault draw. The renderer is tuned carefully: a fix must not make other boards worse.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The Voice coordinator view 'Workhorse news' draws, headlessly and in the browser
- [ ] #2 One test owner reproduces the failing route shape and fails without the fix
- [ ] #3 Every view of every dogfood board still draws, and the renderer's recorded scorecards are unchanged or better
<!-- AC:END -->

---
id: TASK-344
title: A board drawn ahead opens without a loading spinner
status: To Do
assignee: []
created_date: '2026-09-24 22:29'
labels:
  - frontend
  - renderer
dependencies: []
priority: high
type: bug
ordinal: 585000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User report 2026-09-25: boards that should have been drawn ahead at load (TASK-341) open to a loading spinner. A fresh headless browser on main keeps all 15 boards within 30 s, so the failure is in a long-lived tab. Suspects measured: kept pictures live in localStorage (about 5 MB per origin; 15 whole boards are 1.5M characters per theme, and views and both themes overflow it, after which a failed write evicts the oldest half, including pictures the sweep just drew); a prefetched picture no pane shows leaves the query cache after BOARD_CACHE_GC_MS (5 min); the sweep draws only the themes found among cached pictures, light when none; every renderer build makes every kept picture stale, and with multi-second layouts (TASK-342) the sweep then ran for minutes while boards were opened. The user approved adding idb-keyval.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Kept pictures live in IndexedDB through idb-keyval, so every listed board whole in both themes and the views a user reads are kept together
- [ ] #2 The sweep at load draws each listed board in the theme the tab shows
- [ ] #3 A board the sweep has drawn opens without a loading spinner, also after the tab has been open longer than the query cache keeps an unobserved picture, and after a reload
- [ ] #4 A browser test owns opening a board drawn ahead without a spinner
<!-- AC:END -->

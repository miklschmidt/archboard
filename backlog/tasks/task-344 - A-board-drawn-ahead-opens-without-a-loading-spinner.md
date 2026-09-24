---
id: TASK-344
title: A board drawn ahead opens without a loading spinner
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-24 22:29'
updated_date: '2026-09-24 22:38'
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
- [ ] #4 Unit owners in local-pictures.test.ts catch the sweep asking by another name than a pane, a theme the page does not show, and a drawn picture leaving the tab's cache; a headless run against the dogfood vault shows no loading stage when opening boards after the sweep and after a reload
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move kept pictures from localStorage to IndexedDB through idb-keyval, with the stamp in the key so stale pictures are forgotten by reading keys.
2. The sweep draws the theme on the page's root as well as the themes cached pictures show.
3. A render query keeps its picture for the tab's lifetime (gcTime infinite), so a picture drawn ahead is there however long after.
4. Measure in headless Chromium against a vault copy: open boards after the sweep and after a reload, recording any loading stage.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause found in the headless run: the sweep asked for each board by its listed name ("Archboard server") while panes and addresses ask by its key ("archboard server"), so opening a board missed the picture drawn ahead and laid it out again; it looked fast only because the renderer remembers layouts by content. The unit test's listing used the same string for both, so it could not catch it; its listing now names the board "Pipeline" under key "pipeline".
Headless, dark, dogfood vault copy, main renderer: the sweep kept all 15 boards in IndexedDB in 22 s; opening Archboard server, Command interface, Browser application and Board viewer afterwards showed no loading stage, and none after a reload. The only loading stage left is the pane open at page load: 933 ms on a fresh browser, 78 ms after a reload.
<!-- SECTION:NOTES:END -->

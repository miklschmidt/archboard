---
id: TASK-341
title: The browser draws every board ahead of time when the application loads
status: Done
assignee:
  - '@claude'
created_date: '2026-09-24 16:09'
updated_date: '2026-09-24 16:23'
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
- [x] #1 When the application loads, every listed board whose kept picture is missing or stale for its current version, the vault policy and the renderer build is drawn in the background, one at a time, without holding up the board on screen
- [x] #2 Opening a board drawn ahead shows its kept picture without laying it out again
- [x] #3 A board somebody opens while the background drawing runs is drawn first
- [x] #4 One test owner proves drawing ahead at load
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The listing query now hands its query client to the picture source; listed() forgets stale pictures and starts one background sweep per tab (drawListedAhead in local-pictures.ts), prefetching each listed board's opened variant, whole, in the themes the tab reads, one at a time. Owner: local-pictures.test.ts 'a page that loads draws every listed board ahead, and never one it has kept' (fails with the sweep disabled). Headless Chromium on a scratch server over a vault copy: 3 pictures kept 15 s after load (the pane's board among them, while the sweep sat on Archboard server's ~100 s layout), all 15 by 135 s, nothing clicked. Gate: type-check, lint, fmt, UI tests (isolated) and the browser lane pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
When the application loads, every listed board is drawn ahead in the background, one at a time, so a board is ready before anybody opens it; kept pictures come out of storage without a layout. Verified by the new local-pictures owner and a headless run that kept all 15 dogfood boards within 135 s of load.
<!-- SECTION:FINAL_SUMMARY:END -->

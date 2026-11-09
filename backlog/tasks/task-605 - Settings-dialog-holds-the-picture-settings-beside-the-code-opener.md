---
id: TASK-605
title: Settings dialog holds the picture settings beside the code opener
status: Done
assignee:
  - '@claude'
created_date: '2026-11-08T13:44:00Z'
updated_date: '2026-11-08T15:37:00Z'
labels:
  - frontend
  - design
dependencies: []
ordinal: 1062000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Layout engine and Dim on hover stand at the foot of the right panel under the legend. With the chrome now one plane round the picture, that stack reads as clutter beside the canvas. The owner asked to move both into the settings dialog, which today only holds the code opener, and to give that dialog some care so it reads as the place for the shell settings.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The header gear opens one Settings dialog with a tab for the picture settings and a tab for the code opener
- [x] #2 Layout engine and Dim on hover are set in the picture tab, take effect at once and persist in the browser as before
- [x] #3 The right panel no longer shows Layout engine or Dim on hover
- [x] #4 A notice that asks for the opener settings opens the dialog on the code opener tab
- [x] #5 The opener keeps its test, save, reset and keyboard contract inside the new dialog
- [x] #6 Browser tests and the docs (DESIGN.md, docs/agents/frontend.md, docs/design/reader-redesign.md) describe the new place
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified in the running app at 1440x900 in both themes: the gear opens Settings on Picture; Layout engine and Dim on hover take effect at once and persist across a reload; a notice's Opener settings action opens the dialog on Code opener. opener-settings, reader-context and shell-layout browser lanes pass. The dialog anchors at 8vh with max-h 84dvh; a tall tab scrolls under the tabs and the opener footer is sticky at the dialog foot.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The header gear opens one Settings dialog with a Picture tab (layout engine, dim on hover) and a Code opener tab. Both picture settings left the right panel and persist in the browser. A notice's Opener settings action opens the dialog on the opener tab. The dialog is anchored near the top, a tall tab scrolls under the tabs, and the opener's keys stay at its foot; unsaved opener edits survive a tab switch. The opener keeps its test, save, reset and keyboard contract (opener-settings browser owner). Docs and the architecture model's Code target follow.
<!-- SECTION:FINAL_SUMMARY:END -->

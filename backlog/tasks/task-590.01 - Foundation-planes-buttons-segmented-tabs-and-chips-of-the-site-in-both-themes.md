---
id: TASK-590.01
title: >-
  Foundation: planes, buttons, segmented tabs and chips of the site in both
  themes
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T12:47:00Z'
updated_date: '2026-11-07T13:25:00Z'
labels: []
dependencies: []
parent_task_id: TASK-590
type: enhancement
ordinal: 1044000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The shell builds its planes with borders and short blurred shadows, while the site uses hairline rings, a lit top edge, a contact line, recessed troughs and a raised face with a gold underline. Every later surface of TASK-590 needs these pieces first.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The elevation tokens and corners in app.css follow site/DESIGN.md in dark and a chalk translation in light
- [x] #2 Buttons, segmented tabs and toggles, chips and count wells of the ui-kit take the site recipes
- [x] #3 The left column, the pane header and the right panel use the new pieces, and the picture is unchanged
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add the face, code-bed and body-ink tokens to theme.css for both themes, and lighten the dark muted ink to the site's value.
2. Add the elevation recipes of the site to app.css: the dark values as the site sets them, and a chalk translation with umber shadows and white highlights for light. Register the site's radii.
3. Add the quiet-key, trough, chosen-face, tray, plate and code-bed utilities, and give the gold finish its lift and press.
4. Move the ui-kit button, tabs, select, input group and badge onto them, and replace the edge tabs of the left column with tabs in a trough.
5. Move the tree rows, the switch, the right panel rows and the interface counts onto faces and wells.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified by captures at 1920x1080 in both themes of the left column, the pane header, the switches and the right panel. drawn-glyphs.test.ts passes, so the picture is unchanged: the renderer reads only the diagram tokens and the background.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The shell takes the physical language of the site's mock windows in both themes: raised faces with lit edges, sunken troughs, and a raised face with a gold underline for the chosen item. theme.css gains the face, code-bed and body-ink tokens. app.css gains the elevation recipes, the site's radii and the quiet-key, trough, chosen-face, tray, plate and code-bed utilities. The ui-kit controls, the left column, the pane header and the right panel use them. Lint, types, the web unit tests and the shell browser tests pass. DESIGN.md still describes the old elevation and radii; its record of the whole shell is left for the end of TASK-590.
<!-- SECTION:FINAL_SUMMARY:END -->

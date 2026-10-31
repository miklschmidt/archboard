---
id: TASK-559.19
title: Keep the legend visible without a click
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T01:51:00Z'
updated_date: '2026-10-31T03:15:00Z'
labels:
  - frontend
dependencies:
  - TASK-559.06
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 991000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner thought the legend was deleted, because the Key button at the lower left went unnoticed for hours. A legend has to be there without being asked for. The owner chose the right side, as on main: a permanent right column on every Diagram reading, with the legend at its foot. With nothing selected the column shows the open module's description, which also restores the description the edge tab removes from the picture. With a selection the subject stands above the legend. The owner also rejected the word Key, so the name goes back to Legend, the word main uses. Groups close the legend as bright tags in the look of the card tag, with no switch. On this repository 78 of 115 readings show a group, and the most is 5 on Commands. Mocks: /tmp/integrate/header-mockups/legend-right-a.png, legend-right-b.png and legend-groups.png. This replaces the overlay panel of TASK-559.06, which appeared only for a selection. The column costs about 360 px of picture width. The earlier complaint was that a small right sidebar overwhelmed readers, so it holds the legend and short text, and long lists stay in About.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The legend is visible without a click at the foot of a permanent right column on every Diagram reading at 1920 by 1080, and it lists the kinds, line types and groups of that reading
- [x] #2 With nothing selected the column shows the open module's name and description, and with a selection it shows the subject above the legend
- [x] #3 The way to hide kinds stays one control away, and it is visible
- [ ] #4 The picture fits inside the room the column leaves, and a selection never refits it
- [x] #5 The whole legend stays on screen on every corpus reading, and a long subject scrolls above it
- [x] #6 A group shows as a tag in both themes, in the look of the card tag, and the legend has no group switch
- [x] #7 The name is Legend in the product, the code and the docs, and the word Key for this surface is gone
- [x] #8 The bottom left button is gone, and so is any code that only served the overlay
- [ ] #9 The owner accepts it by eye
- [ ] #10 Filter is a real control in the look of the panel's other controls, with an icon, a pressed state and the count of hidden kinds
- [ ] #11 Every row of the legend keeps its position when a kind is hidden, shown or filtered, and nothing shifts sideways
- [ ] #12 A group tag is a button: a click selects that group's parts in the reading with the existing selection, a second click clears it, and the tag shows that it is on
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Make ModelPanel a flex column beside the picture on every Diagram reading, so the camera fits the room it leaves and a selection cannot refit it.
2. With nothing selected, show the open subject through the same scopeHead as About. With a selection, show the subject, and pin the action bar at the column foot.
3. Rename ModelKey to ModelLegend, and lay it out from the mocks at the column foot, outside the keyed subject. Filter puts a switch on each line type, with no popover.
4. Group tags: one group-tag utility in app.css, cut from --tag-<name> in theme.css, the dark palette value in both themes. No group switches.
5. Delete the overlay: panel wait, panel room, clear-of-panel use in ModelDiagram, reveal cover, slide CSS, SIDEBAR_MS.panelWait, the dismiss code.
6. Update DESIGN.md and the docs. CONTEXT.md stays untouched: the brief changed, because another agent rewrites it.
7. Update browser tests, sweep the corpus, run check:all.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
No architecture proposal: the existing model stays accurate. Diagram presentation components already presents legends and details, and no module, relationship or flow changes. A grep of .archboard and skills found no mention of the Key, ModelKey or the overlay panel.
PictureKey stays: it also serves the retained SemanticLegend, and key is the render reply's field and the core's Rust type, and crates/ is out of scope.
Corpus sweep at 1920 by 1080 on the root and 111 modules with parts: the whole legend is on screen on all 112 readings. Tallest legend 289 px, at least 714 px left for the subject, picture 1239 wide, 77 readings show a group, at most 5.
Two panes at 1920 by 1080: each picture is 439 px wide beside its 360 px column.
Root description: a model has no description field, so the root shows the summary of its state, as About does.

Evidence on the final code: bun run check:all exit 0 after 151 s, 21 of 21 tasks, 44 of 44 browser files, 5318 pass, 0 fail, on 932cc66aa plus this change. Screenshots in /tmp/integrate/slice19/.
A long subject scrolls above the legend: 29 selected on Commands gave a body of 708 px holding 1200 px, the body ends where the legend starts, and legend and action bar stay whole, with the bar ending at 1080.
Group tag finish computed from --semantic-orange in both themes: same stops in dark and light, matching the recipe.
Criterion 4 stays open. The second half is proven: a selection leaves the picture frame and its transform identical. The first half is true for the frame, which ends at the column, but not for every drawing. The camera keeps its landing rule (LANDING_FLOOR 0.6), so a drawing that needs less than 0.6 to fit stands at 0.6 and is cut, and the reader pans. On 27 of 112 readings that happens, Commands among them. On the old 1599 px pane it happened on 20 of those 27, so the column adds 7. The rule stays, because the brief keeps the camera moves and a rebuilt picture is coming.
Criterion 7 stays open until the rewrite of CONTEXT.md lands, because that file still names the Key at this head.
Two facts stale after this change, in files out of scope here: the comment on REFERENCE_WIDTH in packages/renderer/src/shared/constants/shell-geometry.ts says the panel lies over the picture, and its value 1271 (mirrored in crates/archboard-layout/src/constants.rs) is above the real room of 1191, which is 1239 less margins. The gates in docs/design/reader-redesign.md were measured at the old pane.

Merged from feat/reader-legend at 6d5287ba8. The full gate passed on the merge in 153 seconds, 21 of 21. Criterion 4 stays open: a selection never refits the picture, but the landing rule stops at scale 0.6, so 27 of 112 readings are cut and the reader pans. On the old pane it was 20 of those 27. The root shows the summary of its state, because a model has no description. Two panes leave each picture 439 px wide.

The owner saw the column and asked for polish: Filter read as plain text, line types swapped places when hidden, because the list sorted hidden kinds last, and group tags did nothing. Decision: a tag click uses the existing selection, so it adds no new state.

The owner objects to the word key wherever it means this legend. PictureKey in the client and in the core stays for now, because the core is owned by the door work. Rename it to a legend word after that merge, in the code and in crates/.
<!-- SECTION:NOTES:END -->

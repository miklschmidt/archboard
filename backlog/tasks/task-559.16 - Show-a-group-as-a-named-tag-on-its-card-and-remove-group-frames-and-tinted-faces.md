---
id: TASK-559.16
title: >-
  Show a group as a named tag on its card and remove group frames and tinted
  faces
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T00:13:00Z'
updated_date: '2026-10-31T06:35:00Z'
labels:
  - renderer
  - frontend
dependencies:
  - TASK-559.14
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 988000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner compared ten ways to show a group colour in /tmp/integrate/header-mockups/ and chose the named group tag: a small bright tag with the group name at the top right of a card, in the finish of a door button. The card face stays neutral, and the chip keeps its node type colour. Group frames go, because the tag says the same thing without the ugly frame, and cards of one group still cluster together in the layout. A tinted face turned orange into brown and light colours into pastels, so it goes too. Mockup: group-context.png, third picture.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A card in a group shows the group name in a bright tag, in both themes, and its face stays neutral
- [x] #2 No reading draws a group frame or region, and cards of one group still stand together
- [x] #3 A long group name and a module in several groups stay readable and never cover the name of the card
- [x] #4 A far card still shows its group
- [ ] #5 Gates 1 to 4 are measured again and the owner accepts the result by eye
- [x] #6 Rule 7 and every group region control are gone, and the legend tags from TASK-559.19 use the tag finish of the card
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Carry a card's groups as tags on its appearance and draw them in the door finish, near and far.
2. Keep card faces neutral, and remove group regions, their drawing and the showGroups plumbing.
3. Gather the cards of one group in the board's order and pull them together on the dense grid.
4. Measure the name row on the corpus and decide how a tag shares it.
5. Update the docs and the tests, and measure the gates.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The tag takes the finish of a door button: gradient, rim, top highlight and dark ink. Mockup: /tmp/integrate/header-mockups/maple-final.png.

A tag never widens a card. The corpus gave identical geometry with a card that grows and with a name that wraps sooner (area 142.3 M each at that step), so a long name wraps sooner. Two tags that leave a name less than half of its room take a row of their own above the name.
Sequence participants and flowchart boxes show no tag: a column head and a step box have no room for one, and containers wear none.
Tag ink on the owner's recipe reaches APCA Lc 37 to 83 over the two gradient stops. The weakest is indigo on its lower stop. That is under the 60 of content text, and the test holds the floor of 30.
Region placement stays dormant in crates/archboard-layout/src/blocks and track: no reading reaches it. Removing it is about 425 references, so it stays out of this change.
Final measures: 103 of 115 readings land at 0.6 or more (105 before), total area 148.9 M (135.9 M before), slowest drawing 467 ms.

Merged to integrate/pr19 with .17 and .18, gate 21 of 21 in 166 s, server 17842 restarted. Every model merged: 106 of 115 readings at 0.6 or more, 1 below 0.4 (Workspace packages 0.20), area 186.0 M, slowest drawing 475 ms, 1765 lines. Open: owner by eye, and the tag ink reaches only APCA Lc 37 to 83 over its gradient.
<!-- SECTION:NOTES:END -->

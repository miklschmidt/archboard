---
id: TASK-559.16
title: >-
  Show a group as a named tag on its card and remove group frames and tinted
  faces
status: To Do
assignee: []
created_date: '2026-10-31T00:13:00Z'
updated_date: '2026-10-31T01:58:00Z'
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
- [ ] #1 A card in a group shows the group name in a bright tag, in both themes, and its face stays neutral
- [ ] #2 No reading draws a group frame or region, and cards of one group still stand together
- [ ] #3 A long group name and a module in several groups stay readable and never cover the name of the card
- [ ] #4 A far card still shows its group
- [ ] #5 Gates 1 to 4 are measured again and the owner accepts the result by eye
- [ ] #6 Rule 7 and every group region control are gone, and the legend tags from TASK-559.19 use the tag finish of the card
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The tag takes the finish of a door button: gradient, rim, top highlight and dark ink. Mockup: /tmp/integrate/header-mockups/maple-final.png.
<!-- SECTION:NOTES:END -->

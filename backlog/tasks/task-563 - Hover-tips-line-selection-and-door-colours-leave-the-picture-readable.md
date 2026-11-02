---
id: TASK-563
title: Hover tips, line selection and door colours leave the picture readable
status: In Progress
assignee:
  - '@codex'
created_date: '2026-11-02T13:25:00Z'
updated_date: '2026-11-02T14:01:00Z'
labels:
  - reader
  - design
dependencies: []
priority: high
ordinal: 1012000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner found three reader problems on PR 26 before the README refresh. A tip covers the picture beside a part while the reader follows its lit connections. A selection of several subjects wears a thick gold band on each line, so the picture turns gold. The vault config clusters its colours in the cool half of the palette, and 16 root packages share one group colour, so unrelated doors look related.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A tip opens clear of the part it is about and of the parts around it
- [ ] #2 A selection of several lines leaves the lines in their own ink, and one line alone keeps a thin ring
- [ ] #3 A door takes the colour of its placing group or kind, and a door with neither stands neutral, so that the model's packages no longer read as one concern
- [ ] #4 The README assets show the final picture
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Decisions: a tip stands in the top corner across from the pointer, with its delay unchanged at 450 ms. A presented walkthrough box takes the foot of the pane, so the tip keeps to the top. One picked line keeps a gold bed at 0.3 opacity. Several lines keep their own ink and stay selected for raising and picking, through the quietLines mark. A door with no colour stands in the neutral finish everywhere, which also affects external and other in the default configuration. In this model, module, function and external claim no colour, Source code is a new group, and eight packages take the colour of their concern. The other eight root packages share teal because they are the shared foundation. Route and datastore share cyan, and ui, config and checks share pink, because these kinds are rare. Doors avoid amber, green and red because these read as gold, added and removed. Relationship colours stay. The model change is a direct edit of current. Proposal JTZvj2vi followed it and was not adopted. capture-native-fixture.ts refuses here, because reading proposal LjzZMsi7 of examples/web-shop needs an archive, so the svg of the recommendations fixture was redrawn from its stored request.
<!-- SECTION:NOTES:END -->

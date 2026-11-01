---
id: TASK-559.17
title: Rebuild the far view so it conforms to each card
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-31T00:14:00Z'
updated_date: '2026-10-31T06:35:00Z'
labels:
  - renderer
  - frontend
dependencies:
  - TASK-559.16
documentation:
  - docs/design/reader-redesign.md
parent_task_id: TASK-559
priority: high
ordinal: 989000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner said that most far views look very bad and do not conform to the card sizes. The far view starts below camera scale 12/14 (0.857), so every picture fitted below that scale opens in it, which makes it the normal view of a large reading. A far card draws a 52 px tile, a name of 15 to 20 px, a path of 15 px and up to 8 lines of responsibility inside a box that the layout sized for the near view, so words truncate or leave empty bands. A group tag, a door button, the edge tab and the shared grid all arrive before this task and must read at far scale.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A far card fits the box it stands in at every size that the corpus produces, with no truncated middle of a word, no empty band and no overflow
- [ ] #2 Name, group tag and kind stay readable at the lowest scale a reading lands at, and a door and an edge tab keep their look and arrow
- [x] #3 Cards of one picture share one far type scale, so that neighbours do not differ by chance
- [x] #4 The swap between near and far keeps its transition, and a card keeps its place across it
- [x] #5 Screenshots of the corpus readings at their landing scale pass Gate 6 in the real pane
- [ ] #6 The owner sees the far view of the root, Browser, Workspace packages and Commands and accepts it by eye
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Compute one far type scale per picture from the room it lands in.
2. Set each far card to fit its box at that scale, with its chip, name, path, the start of its responsibility and its tags.
3. Keep near words on a box too small for far words.
4. Redo the frame's edge tab as one outline on a recessed well, with the well's edge under the tab.
5. Land a module's picture whole in camera.ts once the far view holds.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Far type scale F per picture: name 14F, path 10.5F, note 11F, tag 10F, floor 1. F aims at the larger of 20/14 and (12/14)/landing.
Sweep of the final corpus: 1165 cards, every card has far words, none overflows its box.
Gate 2 on the final code: 83 readings of at most 18 lines, worst name 11.93 px and worst path 8.99 px. One reading misses, Codex session, by 0.07 px at landing 0.596.
Criterion 2 stays open for doors: the layout reserves a door at 20 far units, because F is known only after layout, so a door's words stand at about 7 px at the lowest landing of 0.352. The edge tab scales with the picture inside its reserved room.
Corpus screenshots: /tmp/integrate/slice16/final-*-far.png. Tab close views: /tmp/integrate/slice16/tab-*.png for architecture, sequence, flowchart and legacy frames, near and far, both themes.

Merged to integrate/pr19 at 6539189f3. Open: criterion 2, a door's words are about 7 px at the lowest landing, because the layout reserves a door before the far scale is known.
<!-- SECTION:NOTES:END -->

---
id: TASK-386.05
title: >-
  Opening a card's board is a dive into the card, and going back out is the dive
  in reverse
status: To Do
assignee:
  - '@claude'
created_date: '2026-10-03 15:14'
labels:
  - frontend
dependencies: []
parent_task_id: TASK-386
priority: medium
type: enhancement
ordinal: 675000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Opening a card's board cuts today: the old picture grows by 14 percent while it fades for 280 ms, and the new one assembles for 760 ms. The new board does not look as if it lies inside the card that the reader chose, and going back does not look like coming out of it. Every board's picture is drawn ahead and kept in IndexedDB (TASK-341, TASK-344), so the picture inside a card is ready when the reader chooses it. A drill-down stays a drill-down: the board, the address and the history entry are what they were.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Opening a card's board flies the camera into the card while the board inside it grows from the box of the card to fill the pane, and the pane then shows that board with no jump
- [ ] #2 Going back out of a board reached by a drill-down shrinks it into the card it was opened from
- [ ] #3 When the board inside is not ready, or the reader asked for reduced motion, opening and going back work as they do today
- [ ] #4 A press, a wheel event or a key during the dive ends it at its destination
- [ ] #5 The address changes once, and Back and Forward follow the drill-down as before
<!-- AC:END -->

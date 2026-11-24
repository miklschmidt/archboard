---
id: TASK-678
title: A wide group caption keeps clear of the cables beside it
status: To Do
assignee: []
created_date: '2026-11-24T03:54:00Z'
labels:
  - renderer
  - layout
dependencies: []
ordinal: 1168000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After refactor/remove-track (#151), a group caption wider than its card crowds the cables that run beside the card in Lanes. Lanes already widens a card past its caption until the fans of its cables fit and reserves caption room only on the face it uses; a caption wider than that room still stands against the cables.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 No cable runs within a lane of a group caption on the Lanes readings of the corpus
- [ ] #2 A layout test covers a card whose group caption is wider than the card
- [ ] #3 The Lanes corpus shows which drawings change, and none fails
<!-- AC:END -->

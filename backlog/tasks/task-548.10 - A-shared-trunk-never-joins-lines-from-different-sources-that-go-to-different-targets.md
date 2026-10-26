---
id: TASK-548.10
title: >-
  A shared trunk never joins lines from different sources that go to different
  targets
status: To Do
assignee: []
created_date: '2026-10-26T17:03:00Z'
labels:
  - renderer
  - layout
dependencies: []
parent_task_id: TASK-548
type: bug
ordinal: 963000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In the grading council's first run (TASK-548.09, 2026-10-26) all three graders, each with its own criteria, reported the same defect in four of six Blocks boards: lines from different sources merge onto one trunk and split again toward different targets, so a reader cannot tell which source reaches which target. Examples on feat/faster-first-render 44174b7ba: Board rasterizer, view Walkthrough video (Record command and Replay command merge below Record command, then split to Recording entry and Frame renderer); Codex workhorse, Workhorse operations responsibilities (Operation lifecycle and Operation validation merge and split to Thread link and Epoch ledger); Command dispatch, Command routing; Command interface, Contract parts. The graders also saw these trunks cross group header cards, and in Command dispatch and Command interface an arrowhead end on a group frame rather than a card. Pictures: /tmp/grading-calib/pairs/{016,035,038,039}.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A trunk carries only lines that share their source or share their target
- [ ] #2 No line crosses a group's header card, and every arrowhead ends on a card
- [ ] #3 The grading council judges the changed drawings to read as well or better
<!-- AC:END -->

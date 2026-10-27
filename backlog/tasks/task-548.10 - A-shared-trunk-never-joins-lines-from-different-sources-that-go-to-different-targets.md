---
id: TASK-548.10
title: >-
  A shared trunk never joins lines from different sources that go to different
  targets
status: In Progress
assignee:
  - '@codex'
created_date: '2026-10-26T17:03:00Z'
updated_date: '2026-10-26T21:14:00Z'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Capture the four council cases as native render requests and add a red check for trunks that carry unrelated endpoint pairs. 2. Trace Live panes edge 0L2qr5ja through planning, connection-point movement, and final simplification. Fix group-wall and header clearance at the stage that loses it. 3. Preserve endpoint identity when lines share ports and trunks. Every shared trunk must share a source or a target, and arrowheads must meet their intended card. 4. Run drawing integrity, the standard and whole-board corpora, and provide both SVG sides for parent grading. Keep the council acceptance pending.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-548.08 now reaches routing while repairing the unconditional Groups candidate. The parent-frame and group-context repairs pass their Rust regressions, but Live panes (Track) edge 0L2qr5ja still runs ten units beside the panes region wall. A native replay is red in /tmp/548-08/post-553/wallhug. Greedy reduction retains 28 nodes and 60 edges because the spacing depends on the global layout. The original council trunk cases remain the required endpoint-identity regressions. The owner explicitly brought TASK-548.10 into scope when this work reaches routing.

Correction: the retained Live panes segment runs two units beside the panes region wall, not ten. It lies at x=2985.14 beside the wall at x=2987.14 for 1340 units. Removing bridges leaves the same segment.

The native probes remove all ambiguous trunks from the four council cases. The broader check exposes the same defect on large Blocks drawings. Three causes are fixed in the candidate: port keys lose card identity, gap sizing counts coincident routes as one position, and score-based settling can prefer an overlapping route. Another probe finds compressed face ports on large blocks. The caption checker catches painted backgrounds crossing routes even when the caption words are clear. The new endpoint checker finds an Archboard arrow 20 units beyond a fitted frame. Retaining terminal points during frame fitting repairs that replay. None of these probes constitutes a council verdict.

The broader routing probe now fixes a second cause: the X pass sees vertical runs that only touch, then the Y pass moves their turn and creates a 48-unit overlap at 0.6-unit separation. A reduced two-route regression reproduces this. Reserve their lanes at the touch when unrelated routes approach within one lane at their current or desired positions. Both complete Blocks drawings of Board viewer and Archboard server routes now contain no ambiguous trunk in /tmp/548-08/post-553/touch-wanted-wide. All 17 router tests pass. Extra passes are rejected: they disturb Viewer and a convergence probe costs 75.6 s in the unoptimized replay. The full-face port probe is also rejected because it increases Viewer from 12 ambiguous pairs to 15 and adds a wall overlap. Retain reachable port spans and the face capacity bound. The wider diagnostic still reports compressed Blocks lanes. Council acceptance and the complete corpus remain pending.
<!-- SECTION:NOTES:END -->

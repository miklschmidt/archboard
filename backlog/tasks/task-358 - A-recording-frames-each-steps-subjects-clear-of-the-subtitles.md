---
id: TASK-358
title: A recording frames each step's subjects clear of the subtitles
status: Done
assignee: []
created_date: '2026-09-28 14:48'
updated_date: '2026-10-11 14:23'
labels:
  - voice
dependencies: []
priority: medium
type: bug
ordinal: 599000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found 2026-09-28 reviewing README videos. In recordings, the subtitle box covers cards the step is about: the Archboard tour step 1 hides Board vault, step 4 hides Codex home, and the Web shop pull-request walkthrough's first step hides Email provider and Inventory service. In the pull-request walkthrough's step 4, on the Fulfil a paid order view, the camera frames the messages so the lane headers are cut off at the top, so the arrows run between unnamed lanes. The camera fits a step's subjects to the stage without leaving room for the subtitle box above the caption.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 In a recording, no subject of the step on screen sits under the subtitle box
- [x] #2 A step on a data-flow view keeps the lane headers of its messages in view
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-10-11 audit: AC1 delivered by TASK-392 (subtitles in the walkthrough box's foot; useCaptionReserve on the presentation frame, use-caption-reserve.ts, capped at 50% of the pane by MOST_RESERVED in use-board-camera.ts). AC2 delivered by TASK-375 (flow-head.ts keeps a flow's participant cards at the top of the room). Verified: semantic-board-narrative.test.tsx (17 pass, incl. 'brings it into view above the caption'), semantic-board-flow-framing.test.tsx (4 flow-head cases) and the browser lane (incl. voice-box-presented, semantic-walkthrough-presentation) pass. Not done: a replay or recording of Web shop steps 1 and 4 and Archboard tour steps 1 and 4 looked at frame by frame.

2026-10-11 review correction: the full browser lane (voice-box-presented, semantic-walkthrough-presentation) is NOT evidence for AC1: neither test checks where a subject sits relative to the caption (voice-box-presented checks the orb and that the page never grows). The evidence is the camera rule's own owners: semantic-board-narrative.test.tsx 'brings it into view above the caption' (jsdom at 800x600, reserve capped at 50%) for AC1 and the four flow-head cases in semantic-board-flow-framing.test.tsx for AC2.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered by TASK-392 (caption reserve keeps the step's subjects clear of the subtitle box) and TASK-375 (a data-flow step keeps its lane headers in view). Verified 2026-10-11 by semantic-board-narrative.test.tsx and semantic-board-flow-framing.test.tsx. Caveat: the named steps of the Web shop and Archboard tour recordings were not looked at frame by frame.
<!-- SECTION:FINAL_SUMMARY:END -->

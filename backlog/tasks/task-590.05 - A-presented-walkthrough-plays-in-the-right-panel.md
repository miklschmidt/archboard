---
id: TASK-590.05
title: A presented walkthrough plays in the right panel
status: Done
assignee:
  - '@claude'
created_date: '2026-11-07T12:47:00Z'
updated_date: '2026-11-07T13:25:00Z'
labels: []
dependencies: []
parent_task_id: TASK-590
type: enhancement
ordinal: 1048000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner likes the site walkthrough player: the picture on the left and a raised box on the right with a step rail, the voice orb, the step title, its words and previous, Narrate and next keys. Today the walkthrough box lies over the foot of the picture.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A presented walkthrough shows its rail, number, heading, words, voice pill and keys in a column where the right panel stands, beside the picture
- [x] #2 The rail fills with gold up to the step on screen
- [x] #3 Narrate is the gold primary action, and previous and next are quiet keys
- [x] #4 The picture keeps the camera behaviour of a presented step
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Lay the presented walkthrough out as a column where the right panel stands, 400px wide at most: the rail, the number and words, then the voice pill and the keys at its foot.
2. Remove the camera's bottom reserve and the caption reserve hook, so the picture fits each step to all of its viewport.
3. Place the column beside the picture in the model walkthrough and in the semantic stage.
4. Fill the rail with gold up to the step shown, make Narrate gold, and set the heading at 22px for the narrow column.
5. Update DESIGN.md, the visual authority and its reference capture.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
The rail segments after the step keep Muted Ink at 70% rather than the site's dark wells, because they are controls and must keep the APCA floor of a mark (Lc 56 on chalk, Lc 37 on graphite). The orb is lit in the voice pill only while a voice is live, so AC1 names the pill and not the orb.

Verified by captures in both themes, idle and with the fake voice speaking. The web unit tests (camera expectations moved to the whole viewport), the presentation, voice-box, narration, walkthrough and reader browser tests, and the recording and replay owners pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A presented walkthrough plays in a column beside the picture, as the site's walkthrough player sets it. The rail fills with gold up to the step shown, the heading is 22px, the voice pill and the quiet keys stand at the foot, and Narrate is gold. The camera's bottom reserve is gone, because nothing lies over the picture any more. DESIGN.md, operator-canvas-shell.md and its reference capture describe the column. All presentation tests pass.
<!-- SECTION:FINAL_SUMMARY:END -->

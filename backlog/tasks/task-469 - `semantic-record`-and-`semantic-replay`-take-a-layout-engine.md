---
id: TASK-469
title: '`semantic record` and `semantic replay` take a layout engine'
status: To Do
assignee: []
created_date: '2026-10-12 00:35'
labels: []
dependencies: []
priority: medium
ordinal: 814000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Stills can be drawn with the Blocks layout (`--layout blocks`) but a recorded walkthrough is always drawn with Track, so the video and the pictures beside it in the same pull request show different layouts of the same board. Narrated walkthroughs should be able to use the layout the reviewer sees in the stills.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `semantic record` and `semantic replay` accept `--layout track|blocks`, with the default unchanged
- [ ] #2 A recording or replay with `--layout blocks` is laid out by Blocks in every frame, and the talk keeps which layout it used so a replay draws the same one
- [ ] #3 The recording and replay cost with Blocks on a big board is measured and stated; a frame never waits on a layout that the voice has already moved past
- [ ] #4 Tests cover the option reaching the frames and the stored talk; the `archboard` and `archboard-pr` skills drop the sentence that says videos are always Track
<!-- AC:END -->

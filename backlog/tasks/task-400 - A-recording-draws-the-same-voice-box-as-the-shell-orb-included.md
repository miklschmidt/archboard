---
id: TASK-400
title: 'A recording draws the same voice box as the shell, orb included'
status: Done
assignee:
  - '@claude'
created_date: '2026-10-05 22:50'
updated_date: '2026-10-06 01:08'
labels:
  - voice
  - recording
  - frontend
dependencies: []
references:
  - src/ui/walkthrough-replay/components/ReplayStage.tsx
  - src/ui/workbench/components/VoiceBox.tsx
  - docs/adr/0041-a-recording-is-a-talk-rendered-frame-by-frame.md
priority: high
type: bug
ordinal: 741000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner watched the narrated README videos and found that the voice box in a recording looks broken: it holds the words in a pill that has room for an orb at its left end, and no orb. The shell's presented walkthrough draws a voice box at the foot of its box with the orb, the words and the keys (TASK-391, TASK-392). A recording is drawn by the same walkthrough box, but its replay stage hard-wires bare subtitles and has no orb stage, so the voice box that the shell draws is not what the recording shows. The owner's direction, 2026-10-06: TASK-391 and TASK-392 made no change to the voice box in recording mode and none was asked for, so the voice box (the box that holds the orb) is expected to be in the recordings as it is in the shell, because it is reusable UI. The plain-captions-in-a-recording sentences in those tasks, DESIGN.md, CONTEXT.md and ADR 0041 are assumptions of the implementing agent, not decisions of the owner.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The orb's level in each frame comes from the talk's voice samples alone, so that two renders of one talk give identical frames, and a talk that was kept before this change still renders
- [x] #2 The documents and comments that say a recording has plain subtitles with no orb say what a recording draws now, and the unit and system owners hold the level per frame and the identical render. No test locks wording
- [x] #3 The three narrated README videos are rendered again from their kept talks, without Codex and without spending voice usage, and show the orb
- [x] #4 The voice box in a recording is identical to the voice box of a presented walkthrough outside a recording: the same VoiceBox component at the foot of the same walkthrough box, with everything it holds there (the orb in its socket, the words or the state word, and the keys), and no recording-only variant of it. Seen in frames of a kept talk rendered in light and dark beside the shell's own presented walkthrough with voice live
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified 2026-10-06: the replay page draws the shell's own VoiceBox (orb, words, mute and subtitles keys) from a per-frame level that is the RMS of the 2048 samples before sample n*1600 of voice.wav, computed at render time, so a talk kept before the change still renders and two renders of one talk are byte-identical (same SHA-256). I compared frames of the rendered recording with the shell's presented walkthrough with voice live. A scoped review found no code defect, only stale document sentences, which were fixed. The three narrated videos were rendered again from their kept talks with no Codex usage (readme:assets --replay) and attached.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A recording now draws the same voice box as a walkthrough outside a recording: the replay page mounts VoiceBox with the orb stage, a voice view and the level of each frame, with no recording-only variant. Verified with the replay and unit owners, two byte-identical renders, frames compared with the shell, an independent review, and the narrated videos rendered again from their kept talks and attached.
<!-- SECTION:FINAL_SUMMARY:END -->

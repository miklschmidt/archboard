---
id: TASK-393
title: >-
  The live voice browser owner describes the dock and the orb, not the agent bar
  and the wave
status: Done
assignee: []
created_date: '2026-10-04 15:38'
updated_date: '2026-10-04 23:07'
labels:
  - ui
  - voice
dependencies: []
references:
  - tests/system/browser/codex-live-voice.test.ts
  - TASK-392
priority: medium
type: bug
ordinal: 733000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The browser owner tests/system/browser/codex-live-voice.test.ts is the one test that carries Talk through a fake Codex session to a live voice in a real browser. It fails at its first poll. The agent bar became the dock (TASK-389), and the wave became the orb (TASK-391). The test still looks for `[data-voice-controls]` in an agent bar that no longer exists. It also reads the output wave in the presentation bar. TASK-392 made the presentation bar hold one key that reads Talk and then End voice. So the test is wrong in both parts. Found on 2026-10-04 while closing TASK-392. The voice box owner covers the presentation part there, with the demonstration voice and not a session.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The test passes. Talk in the dock starts a live voice through the fake Codex session, and the orb is lit in the dock circle. Turning subtitles on carries the orb to the voice box. The key that reads End voice ends the voice and releases the browser media.
- [x] #2 In a fullscreen presentation of a pane, the bar key that reads Talk and then End voice carries the same session. So does the voice box, over the picture or at the foot of the presented walkthrough.
- [x] #3 The test reads nothing of the output wave.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence, 2026-10-05. tests/system/browser/codex-live-voice.test.ts carries a real session over the fake Codex. Talk in the dock keeps keyboard focus and lights the orb in the dock circle (:166-178). Subtitles on carry the orb to the voice box (:256-264). In fullscreen the bar key ends the session, releases its media and keeps focus (:305-318). Talk on the same key starts a second session that the box carries, and Space ends it (:320-352). Narrating is a third session on a fresh coordinator, with its words in the box at the foot of the walkthrough (:370-438). The dock key ends it and releases its media (:446-453). voice-box-presented.test.ts holds the voice box at the foot of a presented walkthrough in fullscreen as the one session that Talk started (:222-244). `git grep -n -i wave -- tests` finds nothing. All 19 browser owners pass on the final branch.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rewrote the live voice owner for the dock, the orb, the voice box and the presentation bar single key, and made it read nothing of the wave. Added the fullscreen coverage the criteria asked for. The browser checks found two defects, both fixed: the dock voice key and the bar key dropped keyboard focus while voice started, because a disabled button loses focus. Both keys now stay focusable with aria-disabled and press nothing while they cannot act. Verified by the codex-live-voice, voice-box and voice-box-presented browser owners, and by all eight lanes of bun run check exiting 0 on the final branch.
<!-- SECTION:FINAL_SUMMARY:END -->

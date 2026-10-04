---
id: TASK-393
title: >-
  The live voice browser owner describes the dock and the orb, not the agent bar
  and the wave
status: To Do
assignee: []
created_date: '2026-10-04 15:38'
updated_date: '2026-10-04 16:42'
labels:
  - ui
  - voice
dependencies: []
references:
  - tests/system/browser/codex-live-voice.test.ts
  - TASK-392
priority: medium
type: bug
ordinal: 682000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The browser owner tests/system/browser/codex-live-voice.test.ts is the one test that carries Talk through a fake Codex session to a live voice in a real browser. It fails at its first poll. The agent bar became the dock (TASK-389), and the wave became the orb (TASK-391). The test still looks for `[data-voice-controls]` in an agent bar that no longer exists. It also reads the output wave in the presentation bar. TASK-392 made the presentation bar hold one key that reads Talk and then End voice. So the test is wrong in both parts. Found on 2026-10-04 while closing TASK-392. The voice box owner covers the presentation part there, with the demonstration voice and not a session.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The test passes. Talk in the dock starts a live voice through the fake Codex session, and the orb is lit in the dock circle. Turning subtitles on carries the orb to the voice box. The key that reads End voice ends the voice and releases the browser media.
- [ ] #2 In a fullscreen presentation of a pane, the bar key that reads Talk and then End voice carries the same session. So does the voice box, over the picture or at the foot of the presented walkthrough.
- [ ] #3 The test reads nothing of the output wave.
<!-- AC:END -->

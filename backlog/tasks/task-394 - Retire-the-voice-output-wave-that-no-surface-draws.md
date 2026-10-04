---
id: TASK-394
title: Retire the voice output wave that no surface draws
status: To Do
assignee: []
created_date: '2026-10-04 15:38'
updated_date: '2026-10-04 16:42'
labels:
  - ui
  - voice
dependencies: []
references:
  - TASK-392
priority: low
type: chore
ordinal: 683000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-392 took the last surface that drew the voice output wave out of the product. The fullscreen presentation bar held it, and now holds one key. Nothing under src draws the wave any more. Four things remain. The module src/ui/voice-wave holds a shader, wave state, tests, a README and a vendor exemption in .oxlintrc.jsonc. Its projection lives in src/ui/voice-output-level. The voice session contract still has a `wave` view. The words "beside the output wave" remain in src/ui/voice-controls. The orb is drawn from the measured level and does not use the wave. Found on 2026-10-04 while closing TASK-392.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Nothing under src, tests or the lint configuration names the voice wave module or the projection that fed it. `git grep -w VoiceOutputWave` finds nothing.
- [ ] #2 The voice session contract no longer carries a wave view that nobody reads. The measured output level that the orb follows is untouched.
- [ ] #3 The documents that name the wave are corrected. `bun run check` is as green as it was before.
<!-- AC:END -->

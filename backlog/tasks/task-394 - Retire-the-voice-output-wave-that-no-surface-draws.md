---
id: TASK-394
title: Retire the voice output wave that no surface draws
status: Done
assignee:
  - '@claude'
created_date: '2026-10-04 15:38'
updated_date: '2026-10-04 23:07'
labels:
  - ui
  - voice
dependencies: []
references:
  - TASK-392
priority: low
type: chore
ordinal: 734000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-392 took the last surface that drew the voice output wave out of the product. The fullscreen presentation bar held it, and now holds one key. Nothing under src draws the wave any more. Four things remain. The module src/ui/voice-wave holds a shader, wave state, tests, a README and a vendor exemption in .oxlintrc.jsonc. Its projection lives in src/ui/voice-output-level. The voice session contract still has a `wave` view. The words "beside the output wave" remain in src/ui/voice-controls. The orb is drawn from the measured level and does not use the wave. Found on 2026-10-04 while closing TASK-392.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Nothing under src, tests or the lint configuration names the voice wave module or the projection that fed it. `git grep -w VoiceOutputWave` finds nothing.
- [x] #2 The voice session contract no longer carries a wave view that nobody reads. The measured output level that the orb follows is untouched.
- [x] #3 The documents that name the wave are corrected. `bun run check` is as green as it was before.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Sweep every spelling of the wave: VoiceOutputWave, voice-wave, voice-output-level wave projection, wave view, output wave. 2. Delete src/ui/voice-wave, the wave projection and its test, the unread wave view of the voice session contract and everything that only served it. Keep the measured level the orb follows. 3. Remove the vendor exemption for the wave renderer in .oxlintrc.jsonc. 4. Correct the documents and comments that name the wave. ADR bodies stay as written. 5. Run bun run check lanes. No board is affected unless a board draws the wave module: check .archboard/vault.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Evidence, 2026-10-05. `git grep -n -w -E "VoiceOutputWave|VoiceOutputWaveView|projectVoiceOutputWave|voiceWaveView" -- . ":!backlog"` finds nothing, and no source, test or lint configuration names the voice-wave module or wave-projection. The `wave` member and its `VoiceOutputWaveView` import are gone from src/ui/voice-session/contract.ts. level and subscribeLevel are unchanged. The bare `git grep -w VoiceOutputWave` still matches backlog text (this task and TASK-150.07), which stays as written. src/ui/voice-output-level keeps the level source and meter that the orb follows. The speaking threshold moved to level-source.ts with the same value. Deleted: the whole src/ui/voice-wave module, wave-projection and its test, and the unused use-voice-session hook. No dependency was removed, because each had other users. Left alone and still stale: VoiceControls and VoiceControlsCompact in src/ui/voice-controls have no importers, and most of src/ui/workbench/README.md describes parts that no longer exist.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Retired the voice output wave: deleted the shader module, the projection and the unread wave view of the voice session contract, removed the wave vendor exemption from the lint configuration, and corrected the documents and comments that named it. The orb level path is untouched. Verified with git grep, the contract diff, and all eight lanes of bun run check exiting 0 on the final branch.
<!-- SECTION:FINAL_SUMMARY:END -->

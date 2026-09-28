---
id: TASK-352
title: A recording is narrated in the language its steps are written in
status: Done
assignee:
  - '@claude'
created_date: '2026-09-28 01:49'
updated_date: '2026-09-28 01:51'
labels:
  - voice
dependencies: []
priority: high
type: bug
ordinal: 593000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A narrated recording of an English walkthrough came out in French on one run and Spanish on the next (2026-09-28, semantic record Archboard --walkthrough "Read this board"). The recording voice is given the shared persona, which says to always speak the user's language, and the recording section, which says to use the language the step is written in. A recording has no user and no utterance to take a language from, so the voice model picks one.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The voice prompt a recording starts with carries no rule to speak the user's language, and the rule stays in the prompt a live conversation starts with
- [x] #2 A recording of an English walkthrough is narrated in English on consecutive runs
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move 'Always speak the user's language, humor included' out of VOICE_PERSONA (shared by live voice and recordings) into VOICE_CONVERSATION, which only a live session gets; the persona keeps 'keep board and system names exactly as they are'.
2. The recording section already says 'in the language the step is written in', so a recording then has one language rule.
3. No board is affected: a prompt wording fix (archboard-dev: a test or a wording fix).
4. Verify by recording the English 'Read this board' walkthrough twice with the change and reading the subtitles in the video.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: VOICE_PERSONA (the recording prompt) no longer carries the user-language rule; VOICE_CONVERSATION (live voice only) does. Two consecutive recordings of Archboard 'Read this board' (dark) from a checkout with the change were narrated in English, read from the recorded subtitles; the two runs before the change came out in French and Spanish. bun test src/runtime/codex-realtime: 31 pass. oxfmt --check clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved 'Always speak the user's language' from the persona that recordings share into the live-conversation prompt, so a recording's only language rule is its own: the language the steps are written in. Verified with two English recordings in a row (before: French, then Spanish) and the codex-realtime module tests.
<!-- SECTION:FINAL_SUMMARY:END -->

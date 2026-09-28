---
id: TASK-359
title: >-
  Live narration speaks the language of the walkthrough until the user has
  spoken
status: To Do
assignee: []
created_date: '2026-09-28 14:48'
labels:
  - voice
dependencies: []
priority: medium
type: bug
ordinal: 600000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Found 2026-09-28 by review, not reproduced. TASK-352 fixed recordings, which picked French or Spanish for an English walkthrough because the voice was told to speak the user's language and had no user utterance. Live narration has the same shape: narrationPrompt says 'in your own words and their language', VOICE_CONVERSATION says 'Always speak the user's language', and the first step is handed to the voice as soon as the session starts, before the user has said anything.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A live narration of an English walkthrough starts in English before the user speaks
- [ ] #2 Once the user speaks another language, narration follows it
<!-- AC:END -->

---
id: TASK-380
title: A recording is narrated in its walkthrough's language on every run
status: To Do
assignee: []
created_date: '2026-09-29 23:28'
labels:
  - voice
dependencies: []
priority: medium
type: bug
ordinal: 664000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-352 moved the rule to speak the user's language out of the prompt a recording starts with, and the recording section tells the voice to explain each step in the language it is written in. On 2026-09-29 and 2026-09-30, two of eight recordings of English walkthroughs were still narrated in French: the Inventory service walkthrough 'How stock is reserved' (rollout started 2026-09-29T23:23:45Z, 'Voilà Checkout qui fait preuve d'une sagesse rare...') and one Web shop run during TASK-378. The persona in src/runtime/codex-realtime/lib/voice-prompt.ts is tuned by the user, and the recording section is in src/runtime/codex-realtime/lib/presentation-mode.ts. A README video recorded in the wrong language has to be recorded again.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Ten recordings in a row of English walkthroughs are all narrated in English
- [ ] #2 The voice persona the user tunes keeps its wording, or any change to it is agreed with the user first
<!-- AC:END -->

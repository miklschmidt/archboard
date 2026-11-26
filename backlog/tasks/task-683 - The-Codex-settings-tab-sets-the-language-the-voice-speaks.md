---
id: TASK-683
title: The Codex settings tab sets the language the voice speaks
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-26T12:29:00Z'
labels:
  - voice
dependencies: []
ordinal: 1175000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The live voice is told to speak the user's language, so it guesses: it can drift into another language, and a live narration starts before the user has said anything (TASK-359). Recordings already fix this by naming one language in the voice prompt (TASK-380), the only place a realtime session takes a language from. A user who always wants one language needs the same for conversations and live narrations.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The Codex tab of the settings dialog offers a Voice language choice: Automatic, or one named language
- [ ] #2 The choice is saved and reset with the other Codex settings, and existing settings files still load
- [ ] #3 With a language set, the next voice conversation and live narration prompts name that language and tell the voice to speak only it
- [ ] #4 Automatic keeps the prompts as they are today, and recordings keep their own language
<!-- AC:END -->

---
id: TASK-684
title: The Codex settings tab sets the language the voice speaks
status: Done
assignee:
  - '@claude'
created_date: '2026-11-26T12:29:00Z'
updated_date: '2026-11-26T13:00:00Z'
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
- [x] #1 The Codex tab of the settings dialog offers a Voice language choice: Automatic, or one named language
- [x] #2 The choice is saved and reset with the other Codex settings, and existing settings files still load
- [x] #3 With a language set, the next voice conversation and live narration prompts name that language and tell the voice to speak only it
- [x] #4 Automatic keeps the prompts as they are today, and recordings keep their own language
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add voiceLanguage (BCP 47 tag or null) to the Codex settings schema with default null, so old codex-models.json files load; save it with the model Save, clear it with Reset.
2. createArchboardVoicePolicy takes a voiceLanguage reader, read at each voice start; wiring passes readVoiceLanguage from the settings store.
3. With a language set, the conversation prompt says to speak only that language (switch only when the user asks outright), and live narration names it where a step is explained. Recordings keep their own language.
4. Codex tab: a Voice section with a Language select (Automatic first, then languages by English name).
Architecture: no proposal needed. No new module or relationship: workbench-host already reads the codex-settings store (production.ts readVoiceAgentModelPreferences); archboard check exit 0 with no new warnings.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Advisor (Fable, high effort) agreed with the plan: hard 'speak only' wording (soft wording drifted in TASK-380), plus an outright-ask exception.
User requests during the work: blur the signed-in email until clicked, with a tooltip saying so (HiddenEmail); section titles in the tab overlapped their descriptions because a fieldset legend sits outside the flex column, so the descriptions' negative top margin was removed.
Scrolling: the settings panel already scrolls. A trusted wheel event through CDP scrolled it to the end at 1280x720; agent-browser's own wheel command does not scroll nested scrollers even on a plain HTML page.

Review (sol-loop, gpt-6.2-sol, 3 rounds): kept 6 fixes (strict language rule without the outright-ask exception, language names only, accessible email button, auth summary split, error wording; the sticky footer was reviewed separately and approved); declined an optional voiceLanguage in the save request and a browser check against an older server, since browser and server ship together.
Renumbered from TASK-683, which main took for another task while this branch was open.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
The Codex tab of the settings dialog has a Voice language choice: Automatic, or one named language. It is saved and reset with the other Codex settings; files saved before it existed load as Automatic. Each voice start reads it: with a language set, the conversation prompt says to speak only that language, and a live narration names it where a step is explained, the way a recording names its own. Automatic keeps the prompts unchanged, and recordings keep their own language.

Also, on request: the signed-in email is blurred until clicked, with a tooltip saying so; the tab's section titles no longer overlap their descriptions; and the sticky footer of the Codex and Code opener tabs keeps the dialog's edge and rounded corners.

Verification: presentation-mode, codex-settings route, guard, hook, rules and component tests pass; type check and lint pass; archboard check passes with no new warnings; checked in a running app in both themes. Not verified: a real voice session in another language (needs a live realtime session), and whether Codex's own delegation acknowledgement follows the prompt language.
<!-- SECTION:FINAL_SUMMARY:END -->

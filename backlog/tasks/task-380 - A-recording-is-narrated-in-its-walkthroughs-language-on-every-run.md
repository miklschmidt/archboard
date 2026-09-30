---
id: TASK-380
title: A recording is narrated in its walkthrough's language on every run
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-29 23:28'
updated_date: '2026-09-30 00:33'
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
- [ ] #3 archboard semantic record takes an optional --language, English when it is not given, and the narration is in the language given
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Value format: a BCP 47 language tag (en, da, fr, pt-BR). Why: it is the standard way to name a language, the CLI and the browser both validate it with the platform's Intl without a list to maintain, and Intl.DisplayNames(['en'], {type: 'language', fallback: 'none'}) both refuses a malformed or unknown tag (it throws or names nothing) and gives the English name the prompt states (Danish, Brazilian Portuguese). One shared schema, RecordingLanguageSchema in src/shared/walkthrough-recording, with DEFAULT_RECORDING_LANGUAGE = 'en' and languageName(tag).
2. Prompt: recordingPrompt(name, language) names the language outright at the start of the recording section and again where a step is explained: speak only <Language>, and put a step written in another language into <Language>. VOICE_PERSONA is not edited. narrationPrompt is unchanged, so a live narration keeps speaking the user's language.
3. Path: semantic record --language <tag> (contract option, default en shown in help; ingress RecordLanguageSchema.default('en') refuses an invalid tag as a usage error with the reason and what to pass) -> recordWalkthrough request.language -> the page URL's language search parameter -> recordingRequestOf(search) -> WalkthroughRecorder -> setup.talk({ walkthrough, recording: { language } }) -> realtimeStart presentation.recording = { language } (browser command schema validates it) -> server narrationFor -> RealtimePresentation.recording = { language } | null -> voicePresentationPrompt -> recordingPrompt(name, language). Only a recording carries a language, because the language sits inside the recording object.
4. Tests: presentation-mode.test.ts (a recording's prompt names the given language and English when none was given; a narration's prompt carries no language rule); walkthrough-recording-refusals.test.ts (an invalid --language is refused before a browser starts); walkthrough-recording.test.ts (--language da reaches the voice start: the fake Codex's thread/realtime/start prompt names Danish). Prove each fails without the change.
5. Docs: record help (from the contract), skills/archboard/references/sequences-views-walkthroughs.md, docs/design/walkthrough-recording-acceptance.md, INSTALL.md recording section; bun run generate:skill-artifacts.
6. Board proposal: Board rasterizer@TASK-380 (the record command, the recorder, the page and the voice start carry the language). No other board draws the recording prompt's language.
7. Verify: bun run check. The ten English recordings and one --language da recording (AC #1, #3 real voice) wait for the headless Chromium GPU fix (TASK-378 follow-up), per the user's change of plan on 2026-09-30.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User decision 2026-09-30: change the recording prompt's language rule, and give archboard semantic record an optional --language flag that defaults to English. The narration is in that language whatever language the steps are written in.
<!-- SECTION:NOTES:END -->

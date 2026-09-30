---
id: TASK-380
title: A recording is narrated in its walkthrough's language on every run
status: Done
assignee:
  - '@claude'
created_date: '2026-09-29 23:28'
updated_date: '2026-09-30 01:56'
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
- [x] #1 Ten recordings in a row of English walkthroughs are all narrated in English
- [x] #2 The voice persona the user tunes keeps its wording, or any change to it is agreed with the user first
- [x] #3 archboard semantic record takes an optional --language, English when it is not given, and the narration is in the language given
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

Built (14239e8b): recordingPrompt(name, recording) names the language (Intl.DisplayNames English name of a BCP 47 tag) at the start of the recording section ('Recorded walkthrough, narrated in <L>. Speak only <L>, from your first word to your last.') and where a step is explained ('explain it at once in <L> ... A step written in another language is still explained in <L>: put what it says into <L>.'). VOICE_PERSONA is untouched (AC #2). The live narration prompt is unchanged and names no language.
Value format: a BCP 47 tag, one shared RecordingLanguageSchema in src/shared/walkthrough-recording (refined with Intl.DisplayNames fallback none, which throws on a malformed tag and names nothing for an unknown one), default en. Path: semantic record --language (ingress default en, help default from the contract) -> recordWalkthrough -> page address ?language= -> recordingAskedOf -> WalkthroughRecorder -> setup.talk({ recording: { language } }) -> realtimeStart presentation.recording (RecordingNarrationSchema) -> narrationFor -> RealtimePresentation.recording: RecordingNarration | null -> prompt. Only a recording carries a language because it lives inside the recording object.
Tests, each shown failing without the change: src/runtime/codex-realtime/tests/presentation-mode.test.ts 'a recording's voice prompt names the one language it is narrated in, and a narration's names none'; src/cli/commands/tests/semantic-record-language.test.ts (refusal before the handler, pass-through, declared default); tests/system/server-state/walkthrough-recording.test.ts now records with --language da and asserts the thread/realtime/start prompt names Danish.
Gate: bun run check exit 0 under systemd-run MemoryMax=16G (modules 3699 pass, system 183 pass, repository 8 pass, every serial browser owner pass).
Board rasterizer@TASK-380 adopted at version 14, dogfood check clean. The proposal was adopted now because the code landed on main; only real-voice verification remains.
Remaining: AC #1 and AC #3 need real-voice recordings: ten English walkthroughs in a row with no --language, all narrated in English, and one with --language da narrated in Danish. Per the user's change of plan on 2026-09-30 these recordings run after the headless Chromium GPU rendering fix (TASK-378 follow-up). None were run.

Real verification, 2026-09-30, after the TASK-378 GPU fix: eleven recordings one at a time on fresh scratch servers (ports 3521-3531), frontend rebuilt from main. Ten with no --language, across six walkthroughs (Archboard "Read this board" twice, Web shop "Why checkout stops waiting" twice, Inventory service "How stock is reserved" three times, Voice coordinator "Why voice is its own thread", Web shop "How an order is placed today", Board rasterizer "How a walkthrough becomes a video"): all ten narrated in English, with no non-ASCII letters in any transcript. One with --language da (Inventory service): narrated in Danish ("Her ser vi, hvordan Checkout API holder igen med kortet, indtil varerne faktisk er reserveret."). Longest frame gap per recording 37 to 50 ms. VOICE_PERSONA is unchanged.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A recording is narrated in one named language: archboard semantic record takes --language with a BCP 47 tag (default en), refuses a tag that names no language before it starts, and the recording prompt names the language twice, including for steps written in another language. The persona the user tunes is unchanged. Verified with ten English recordings in a row across six walkthroughs and one Danish recording, after the TASK-378 GPU fix, plus the prompt, CLI and end-to-end tests.
<!-- SECTION:FINAL_SUMMARY:END -->

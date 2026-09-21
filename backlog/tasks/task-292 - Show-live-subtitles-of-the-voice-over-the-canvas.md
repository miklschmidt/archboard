---
id: TASK-292
title: Show live subtitles of the voice over the canvas
status: In Progress
assignee:
  - '@claude'
created_date: '2026-09-20 15:09'
updated_date: '2026-09-20 23:00'
labels:
  - voice
  - frontend
  - ux
dependencies: []
references:
  - docs/design/operator-canvas-shell.md
  - docs/agents/frontend.md
ordinal: 506000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
While the voice model talks, the person wants to read along on the canvas itself rather than in the Transcript tab of the dock: subtitles overlaid on the board, especially during a narrated walkthrough where the eyes are on the picture. The browser already receives the assistant transcript as it is produced (provisional text that grows, then final) and measures the model audio output level for the speaking wave. The known difficulty is timing: transcript text is produced at generation speed, ahead of the audio that is paced in real time, so text shown the moment it arrives runs ahead of the voice. There are no per-word timestamps in the Codex 0.155.1 V3 events.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 While the voice model speaks, what it is saying appears as subtitles over the canvas of the voice-linked pane, and disappears shortly after it stops
- [ ] #2 Subtitle text is revealed at speaking pace and only while the model is audible, never ahead of what has been received, so it does not run ahead of the voice
- [ ] #3 Subtitles show at most two lines of recent speech, never cover the walkthrough caption, and never take pointer input from the canvas
- [ ] #4 An interruption stops the subtitle where the speech stopped; what the person says is not subtitled
- [ ] #5 Reduced motion cuts any subtitle animation, and the subtitles can be turned off
- [ ] #6 Covered by pacing logic tests and a rendered owner
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Cue cutting (src/ui/voice-subtitles/lib/cues.ts): cues of at most 84 characters, cut at word boundaries and at sentence ends where the cue is long enough; a cut depends only on the words before it, so a cue on screen never changes as the utterance grows.
2. Recency (lib/recency.ts): a word is shown when it arrives; what was said before watching began is history; the subtitle goes when SUBTITLE_LINGER_MS (2500) runs out on the latest word, and returns with the next. The hook owns the one timer.
3. Component: live-caption setting, a box of fixed width and height with left-aligned text, so an arriving word never moves the ones before it; aria-hidden, no pointer input, newest word fades in unless reduced motion. Mounted only while subtitles are wanted, so turning them on mid-utterance does not replay.
4. Stage slot: SemanticBoardStage takes an overlay node; low over the picture normally, above the caption while a walkthrough is presented.
5. Application wiring: PaneSubtitles reads the transport snapshot's voice.transcript while voice is active or recovering, for the pane the owners belong to.
6. Preference: one small store, localStorage key archboard.voice.subtitles, on by default; SubtitlesToggle beside the compact voice controls in the dock header.
7. Owners: cue and recency unit tests, a rendered component test, the stage overlay slot in the driven-presentation rendered test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
FIRST CUT WAS WRONG, corrected 2026-09-20. It assumed transcript text runs ahead of the audio with no timing, and so paced the reveal at 3 words a second, advancing only while the measured output level was above VOICE_OUTPUT_SPEAKING_LEVEL. In a real session that made subtitles appear late and stall after a few words. Measured from the Codex log of the 21:37 session (logs_2.sqlite, output_transcript.added events): the V3 transcript arrives one word per delta, each carrying start_ms and end_ms on the wire, and word arrival tracks the audio clock within about 45 ms (7.8 s of speech took 7.815 s to arrive). The text was already on time; the pacing layer throttled it, since frame RMS dips under the threshold between syllables, so it fell further behind with every sentence. The app-server notification (thread/realtime/item/transcript/delta) does not pass the word timing on, and it is not needed.

Now: each word is shown as it arrives, no pacing and no audio gate. The longest pause inside a turn in that session was 1.6 s, hence SUBTITLE_LINGER_MS = 2500. SUBTITLE_WORDS_PER_SECOND and SUBTITLE_SETTLE_MS are gone, as is lib/pacing.ts.

Noticed, not changed: codex-realtime's publishTranscript emits one event per transcript record on every delta, and each triggers a full snapshot projection that diffs to nothing; harmless to the browser, wasteful on the server in a long session.

Verified: lint, fmt, both type-checks; bun test --isolate src/ui src/shared (1228 pass); serial browser lane (19 pass); box looked at in headless Chrome at 1920x1080 with a full cue and a short one, in and out of a walkthrough. Not verified: a real voice session with the corrected build. Acceptance criteria left unchecked until then; AC #2's wording (revealed at speaking pace while audible) describes the abandoned mechanism, the intent (never ahead of, and in step with, the voice) is what the correction serves.

ROOT CAUSE of 'late, then stalls' and then 'no subtitles at all', found 2026-09-21 by reproducing in real Chrome: nothing published a browser snapshot when the voice transcript changed. The gateway publishes on projection, approval and lifecycle changes only, so transcript text reached the browser when something unrelated happened to publish. The dock's Transcript tab lagged the same way. The first cut's pacing hid this behind its own delay; the second cut, which shows words as they arrive, showed nothing because nothing arrived.

Fixed in src/server/canvas/lib/transcript-changes.ts (watchTranscriptChanges): transcript events from the realtime adapter are a change source of the browser gateway, coalesced per microtask because the adapter emits one event per record for every word. Owner: src/server/canvas/tests/transcript-changes.test.ts.

Second defect found on the way: Codex 0.155.1 starts every transcript segment with EMPTY text (core/src/realtime_history.rs add_delta) and the browser contract refuses empty text, so the snapshot projection was invalid from each item/started until its first delta. orderedRecords (src/runtime/codex-realtime/lib/records.ts) now leaves a segment out until it has words. Owner: src/runtime/codex-realtime/tests/empty-start.test.ts.

End-to-end owner added, which is what should have existed from the start: the fake Codex (tests/system/canvas-state/fixtures/fake-codex-production.ts) now streams the assistant's words as item/transcript/delta after an empty item/started, as the real one does, and tests/system/browser/codex-live-voice.test.ts watches the subtitle over the picture grow to the whole sentence in real Chrome. It failed before the two fixes and passes after.

Verified: lint, fmt:check, both type-checks, test:modules (3436 pass), test:system (169), test:repository, test:serial-browser (19). Needs a server restart, not just a page reload: the fix is server-side.

2026-09-21: the user retested a real voice session after the server restart (transcript change source, empty-segment filter, semantic callbacks recorded only) and reports it works. Acceptance criteria still to be checked off through the finalization guide.
<!-- SECTION:NOTES:END -->

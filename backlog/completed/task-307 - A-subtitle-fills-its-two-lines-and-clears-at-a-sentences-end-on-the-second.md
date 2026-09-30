---
id: TASK-307
title: 'A subtitle fills its two lines, and clears at a sentence''s end on the second'
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 13:18'
updated_date: '2026-09-23 13:30'
labels:
  - voice
  - frontend
  - ux
dependencies: []
ordinal: 539000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Subtitle cues (TASK-292) are cut at 84 characters, an estimate of two lines of a 46ch box in a proportional face, so the box clears visibly short of its two lines (the user, 2026-09-23). A cue also ends at any sentence end once it holds 36 characters, which can clear the box after a sentence ending on its first line. The user wants the box to clear once a sentence ends on its second line, and otherwise only when the next word would wrap to a third, measured with pretext (already a dependency, used by the renderer) rather than estimated.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A cue holds words until the next would wrap to a third line of the subtitle box, as the browser draws it
- [x] #2 A cue ends after a word ending a sentence only when that word is on the box's second line
- [x] #3 A cue on screen still never changes as more words arrive
- [x] #4 Line breaks are measured with pretext in the box's own font and width after the font has loaded, not estimated from characters
- [x] #5 Verified by cue unit tests with a stated line measure and in real Chrome, where a long utterance fills both lines and never shows a third
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. lib/cues.ts: cuesOf(words, lines) where lines(text) is how many lines a run of words takes in the box; overflow to a third line starts the next cue; a sentence end closes the cue when the cue is on two lines. CUE_MAX_CHARS and CUE_SENTENCE_MIN_CHARS go.
2. lib/measured-lines.ts: a line count for one box from its computed font, measured by pretext (prepare + layout) against the box's content width, made once the font has loaded.
3. VoiceSubtitles keeps its box mounted while subtitles are on (invisible when empty) so the box can be measured; the hook takes the line count and shows nothing until it has one.
4. Owners: cues unit tests with a fixed-width line measure; the rendered component test; the live-voice browser owner checks a long utterance never exceeds two lines.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
cuesOf(words, lines) replaces the 84/36-character rule: a word that would take the cue to a third line begins the next cue, and a word ending a sentence ends the cue when the cue is on two lines. lib/measured-lines.ts: lineCountOf(box) reads the box's computed font and content width (box-content) and counts lines with pretext (prepareWithSegments + measureLineStats); faceLoading(box) waits for the face via document.fonts so pretext never caches a fallback measurement. The box stays mounted (invisible) while subtitles are on, so it can be measured; the hook shows nothing until it has the line count.
Owners: subtitles.test.ts (a 40-character greedy wrap: concrete cues for a sentence ending on line 2, a full box, a sentence ending on line 1 that does not end the cue; cues never re-cut as words arrive); voice-subtitles.test.tsx (stylesheet width 400px, pretext measure 10px/char: the rendered subtitle begins again where a third line would start; fails when the width is misread, checked by mutation). The live-voice browser owner's subtitle reader treats the empty box as no subtitle and passes in real Chrome.
Looked at: an e2e recording with a temporarily long narrated line (real Chromium, rebuilt frontend), frames at 10 fps: cues fill both lines, 'The front door.' on line 1 does not clear, 'answer.' wrapping to line 2 ends the cue, no third line anywhere. A finished sentence stays only until the next word arrives, which in real speech is the pause after it.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Subtitle cues are cut by measured lines instead of a character estimate: pretext measures in the box's own font and width once the face has loaded, a cue fills both lines, ends early only at a sentence ending on the second line, and never wraps to a third. Verified by cue unit tests, a rendered component test, the live-voice browser test and frames of a real Chromium recording.
<!-- SECTION:FINAL_SUMMARY:END -->

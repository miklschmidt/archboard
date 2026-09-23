---
id: TASK-306
title: A recording carries the voice's subtitles
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 13:18'
updated_date: '2026-09-23 13:21'
labels:
  - recording
  - voice
  - frontend
dependencies: []
ordinal: 538000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recorded walkthroughs (TASK-304) have no subtitles: the recording page gives its pane no subtitle overlay, on the reasoning that the caption says what the step says and nobody in the video can turn them off. Watching the first real recordings, the user (2026-09-23) missed them: the voice explains each step in its own words, which the caption does not carry, and a reviewer often watches a pull request's video muted or skimming. Other browsers on the canvas still must not subtitle a recording's words (they narrate a board nobody there is looking at).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A recorded video shows the voice's subtitles over the picture, above the caption, as it does for a narrated walkthrough in the shell, whatever the recording browser's subtitle preference
- [x] #2 Another browser on the same canvas still shows no subtitles of a recording's voice
- [x] #3 Verified by the pane-subtitles owner and by looking at frames of a recording
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. subtitledTranscript takes whether the page is the recording: a recording's transcript is subtitled only on its own page, and everything else only elsewhere.
2. PaneSubtitles/useSubtitleOverlay: on the recording page subtitles are always on (no preference: nobody can toggle them in a video).
3. useRecordedViews passes the overlay to the recording's pane instead of null.
4. Update the pane-subtitles owner; ADR 0035 and CONTEXT.md where they say a recording carries none; look at frames of an e2e recording.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
subtitledTranscript(voice, recording) subtitles a recording's transcript only on the recording page and every other session only elsewhere; PaneSubtitles is always on for a recording (no preference); useRecordedViews hands the recording pane the page's overlay. Owner: src/ui/application/tests/pane-subtitles.test.ts (all four pairings). Looked at: frames of the e2e recording (fake voice, real Chromium, rebuilt frontend) show the subtitle above the caption growing word by word through both steps. lint, type-check, src/ui/application + src/ui/voice-subtitles tests pass.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A recording page now subtitles its voice over the pane, above the caption, regardless of the subtitle preference; other browsers still do not subtitle a recording. Verified by the pane-subtitles owner and by frames of an end-to-end recording.
<!-- SECTION:FINAL_SUMMARY:END -->

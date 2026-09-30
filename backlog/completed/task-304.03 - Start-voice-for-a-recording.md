---
id: TASK-304.03
title: Start voice for a recording
status: Done
assignee:
  - '@claude'
created_date: '2026-09-23 10:31'
updated_date: '2026-09-23 12:38'
labels:
  - voice
  - codex
dependencies: []
parent_task_id: TASK-304
ordinal: 533000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A recording is narrated with nobody listening live and nobody at the controls. The voice model has to explain each step it is handed, never hand off, invite questions or fill silence, and it must not begin before the page has started capturing. The canvas has one voice session; a recording started from a headless page must not stop somebody who is talking.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 realtimeStart can mark a narration as a recording; the voice prompt then says the talk is recorded, explains each step as it arrives, and ends after the last step with one closing sentence
- [x] #2 A recording start sends no delegation acknowledgement filler and does not open step 1 itself: the page moves to each step, and the server hands every step to the voice as it does a step chosen by hand
- [x] #3 A recording start is refused while a voice session is live on the canvas, and the refusal says why
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
RealtimePresentation.recording; a recording prompt section instead of the narration one; 'On screen now' step words; leaving never told; delegationAckFiller false; no openNarration for a recording; refuse a recording start with voice_live while a session is live, without stopping it, the words reaching the browser through the gateway's fixed message.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built by an implementer (c64a44ba), reviewed (approve with should-fix), merged c20fb050. Review fixes in 89eed918: a recording is refused only while the adapter still holds a live session (a session Codex ended by itself no longer blocks it; module owner proven to fail without the fix); a recording's voice gets the persona and its section and none of the conversation rules (hand-offs, pointing, approvals, Narrate); the trace message no longer repeats the gateway's sentence; authored contracts doc updated.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A realtime start can be a recording: the voice gets its persona and a recording section (explain each step as it lands, then stop) and none of the conversation rules; the coordinator gets a rule to write only [COMMENTARY] while it lasts and workhorse outcomes are injected instead of spoken; no delegation filler; the server opens no step, and each step the page reports is handed over as speech like a step chosen by hand; a recording start is refused with voice_live while the adapter holds a live session, never stopping it, and its words reach the browser. Verified by presentation-mode, realtime-actions (stale session) and outcome-report module owners, tests/system/canvas-state/walkthrough-recording-start.test.ts, and three real-voice recordings.
<!-- SECTION:FINAL_SUMMARY:END -->

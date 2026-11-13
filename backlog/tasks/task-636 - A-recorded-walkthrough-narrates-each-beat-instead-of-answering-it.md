---
id: TASK-636
title: A recorded walkthrough narrates each beat instead of answering it
status: Done
assignee:
  - '@claude'
created_date: '2026-11-13T20:11:00Z'
updated_date: '2026-11-13T21:31:00Z'
labels: []
dependencies: []
priority: high
ordinal: 1078000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Since 2026-11-01 narrated recordings open beats as replies to the user: "Sure. It means", "It's basically saying", "Right, so you point an agent at a repo". Codex 0.166.0 hands each recorded beat to the V3 voice as a speakable session.context.append with no sender, so the voice reads it as the user's turn. Commit 5c3f5f2762 dropped the quoted heading from the recorded beat; every recording up to 2026-10-30 was handed the heading and narrated the system. The README explainer, pull-request and newcomer videos were recorded with the broken beat.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A recorded beat reaches the voice with its quoted heading and body, and never with its position
- [x] #2 The recording prompt says what the voice says first, and the realtime voice tests pass
- [x] #3 A real recording of each README narrated walkthrough opens every beat on the system, with no reply, acknowledgement or repeated instruction in its transcript
- [x] #4 The README links the refreshed explainer, pull-request and newcomer videos
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cause: Codex 0.166.0 hands a recorded beat to the V3 voice as a speakable session.context.append with no sender, so the voice reads it as the user turn. Clean talks up to 2026-10-30 got `Explain in your own words: "<heading>". <body>` and a prompt opening "This time nobody is talking with you"; 5c3f5f2762 (2026-11-01) dropped both. Restoring them alone still gave "This one means" and "Yeah, go on." on 2026-11-13. gpt-live-1.1-codex alone gave "So this is saying". Labels instead of an instruction ("Speaker notes", "Script") left the voice silent.

Fix: the beat asks the voice to tell the listener, the prompt names both habits (commenting on a text, answering a speaker) and says the first words name a part of the system, and Archboard Codex config pins experimental_realtime_ws_model = "gpt-live-1.1-codex" (upstream default after 0.166.0, openai/codex b05266d61b). A throwaway server wrote that line into the Codex home config itself.

Proof (2026-11-13, 21:17-21:23 UTC): all three README walkthroughs recorded once each; every beat of explainer, pr-walkthrough and newcomer opens on the system, with no reply, acknowledgement or repeated instruction. Videos attached: explainer 78ebe388, pr-walkthrough 259590d4, newcomer 503654ce. Sol (gpt-6.1-sol, xhigh) approved two rounds on earlier versions of the prompt.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Recorded walkthroughs narrate each beat instead of answering it. A recorded beat carries its quoted heading and asks the voice to tell the listener, the recording prompt is the October one with both failure habits named, and Archboard pins the realtime voice to gpt-live-1.1-codex until the pinned Codex defaults to it. The three README videos are re-recorded and relinked. Risk: the voice is still a model; one clean run of each walkthrough is the evidence, and the model pin is an experimental Codex key.
<!-- SECTION:FINAL_SUMMARY:END -->

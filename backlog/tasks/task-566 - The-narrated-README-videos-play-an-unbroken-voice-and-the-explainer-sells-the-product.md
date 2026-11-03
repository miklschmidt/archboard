---
id: TASK-566
title: >-
  The narrated README videos play an unbroken voice, and the explainer sells the
  product
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-03T04:09:00Z'
updated_date: '2026-11-03T04:09:00Z'
labels:
  - readme
  - voice
  - recording
dependencies: []
priority: high
ordinal: 1015000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The owner heard the narrated README videos drop out for short moments, like a call with bad reception, and saw the newcomer subtitles arrive seconds late and in chunks.

Measured on 2026-11-03: in a test recording, the recording browser's WebRTC receiver concealed 1.5 s and stretched 1.8 s of an 83 s voice with no packet lost. Its jitter buffer fell to 30-50 ms between sentences and ran dry at each new sentence. A local loopback with the same painting page concealed nothing, so the renderer is not the cause. The late newcomer subtitles came late from upstream: the Codex rollout logged each finished line at the moment the page stamped it. The other kept talks show words about 0.5-0.9 s before they are heard, as before the Rust renderer.

The owner also asked that the explainer walkthrough be rewritten as a marketing video about use cases and the overall system design, not implementation details of the canonical model.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A recording buffers the voice through the WebRTC receiver's jitterBufferTarget, with the duration and its reason in @archboard/timing
- [ ] #2 A kept talk records how much of the voice the receiver concealed and stretched, and model record says when the voice dropped out
- [ ] #3 The explainer walkthrough presents Archboard's use cases and overall system design in plain words
- [ ] #4 The explainer, pr-walkthrough and newcomer videos are recorded again, each with no concealed voice and subtitles that do not lag the voice, and README.md links the new attachments
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Buffer the recording's voice receiver (RECORDING_MS.voiceBuffer) through a receivers hook in the voice package.
2. Keep the receiver's concealed and stretched samples in the talk; model record says when the voice dropped out.
3. Verify with a test recording: concealed samples near zero.
4. Rewrite the explainer walkthrough through model edit.
5. Record the three narrated videos, check each for concealment and subtitle timing, attach them and update README.md.
<!-- SECTION:PLAN:END -->

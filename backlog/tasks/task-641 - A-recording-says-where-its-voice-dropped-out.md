---
id: TASK-641
title: A recording says where its voice dropped out
status: To Do
assignee: []
created_date: '2026-11-15T03:32:00Z'
updated_date: '2026-11-15T04:37:00Z'
labels: []
dependencies: []
type: bug
ordinal: 1083000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Narrated README takes on 2026-11-13 and 2026-11-15 often lost exactly 13,920 samples (290 ms) of voice, once 13,800 and once 13,200, while the machine was quiet (load about 2), and other takes lost none. The same count across takes suggests a fixed cause rather than load. The recorder reads the WebRTC concealed-sample total once, at the end of the take (apps/web/src/ui/walkthroughs/recording/clients/voice-reception.ts), so nobody can tell whether the loss falls inside speech, between beats, or after the voice ends, or whether a listener hears it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A kept talk records when the voice dropped out, not only how much
- [ ] #2 The cause of the recurring 290 ms loss is known, and it is fixed or shown to be inaudible
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Measured 2026-11-15: one newcomer take that briefly kept WebRTC silentConcealedSamples concealed 13,800 samples, 12,240 of them as silence and 1,560 (33 ms) with sound. A second take showed exactly the same counts. That split is what one 287 ms gap gives when the expand fades to silence, so the counters alone cannot say whether the voice was speaking. The take's voice.wav has no quiet run of 200 ms or more inside any step's speech: its long quiet runs are the start and the gaps between steps. So the gap most likely falls at a step boundary, but this is not proven. The README newcomer video (2026-11-15) is that take. Still open: when the loss happens, and its cause.
<!-- SECTION:NOTES:END -->

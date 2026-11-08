---
id: TASK-590.09
title: The Narrate key and the voice box are one element
status: In Progress
assignee:
  - '@claude'
created_date: '2026-11-07T15:06:00Z'
updated_date: '2026-11-07T16:44:00Z'
labels: []
dependencies: []
references:
  - packages/workbench/src/ui/workbench-client/orb/state/orb-stage.ts
  - >-
    apps/web/src/ui/architecture-drawing/canvas/presentation/components/PresentationFoot.tsx
parent_task_id: TASK-590
ordinal: 1052000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
On 2026-11-07 the owner asked for a shared element transition between the Narrate key at the foot of a presented walkthrough's column and the voice box that floats low over the picture. Both are pills with a gold circle at their start, and today both show at once while voice is on, so the page shows two versions of the same thing.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 While voice is off and a presented walkthrough's Narrate key is on the page, the dark orb waits in the key's gold circle, which is a third home of the orb stage (narrate). A dark orb in another home moves there once it is out of sight
- [x] #2 The key draws its gold disc and microphone only while the orb waits in its socket. While the orb is away the key keeps an empty seat and still says why it cannot narrate
- [x] #3 Pressing Narrate tells the stage to launch: the next orb that is lit leaves from the key's socket, lit from the start of the flight, and flies to where it is wanted, the voice box or the dock when subtitles are off. Voice started another way, such as Talk in the dock, is lit where it is wanted and is not launched out of a key
- [x] #4 When voice ends while the orb is in the voice box and a Narrate key is on the page, the orb flies out of the box while the box is still up, lands in the key's seat and fades there at idle, so the gold disc comes back
- [x] #5 With reduced motion, and when either end is not on screen, the orb is cut in place of flown. In fullscreen a flight crosses inside the presented element
- [x] #6 Unit tests of the orb stage cover the rest in the narrate seat, the launch and the return at ending, and a browser owner proves that after Narrate the orb rests in the box with the narrate seat empty, and after voice ends it rests in the narrate socket
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. orb-stage.ts: OrbHome gains narrate. Each home keeps its sockets newest last; the newest is the home's, and the one before it is the home's again when it goes. A dark orb waits in the narrate socket while one is offered. One still seen in another home moves there when the holder's opacity transition ends. A flight already bound for that socket lands lit and fades there.
2. launch() arms a one-shot on the narrate socket. The next lighting of an orb that rests there marks the holder data-launched, which counts as seen and drops the fade delay, and flies it to the home wanted. A launch waits in its key while the home wanted is not on screen (the dock's first wish in fullscreen). It is spent with that lighting and lost when its socket is withdrawn.
3. use-orb-stage.ts: useOrbLaunch. api/voice.ts exports OrbSlot and useOrbLaunch. The replay page's orb assembly (OrbHost, useOrbPlacement, useCircleState) becomes RecordedOrb, so the entry stays at its ceiling of 109 (ADR 0058).
4. AgentDock: at circle state ending, with the voice in the box and a narrate socket offered, wish narrate.
5. PresentationFoot: the gold circle is a seat holding the disc and OrbSlot home=narrate; app.css draws the disc only while the socket is occupied; pressing Narrate launches, then starts. Only the words dim while held.
6. Page geometry moves to orb/clients/orb-screen.ts; the stage tests share tests/ui/support/orb/stage-harness.ts, and the narrate home has its own owner (narrate-home.test.tsx).
7. Docs: stage header, VoiceBox, VoiceControl, AgentDock and PresentationFoot comments; DESIGN.md and its sidecar; operator-canvas-shell.md and its walkthrough capture.
8. Browser owner voice-box-presented.test.ts gains the Narrate launch and return. Frames of both captured in both themes over the fake Codex.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verification (2026-11-07): orb unit tests 34 pass (orb-stage, narrate-home, orb-flight, orb-dynamics); canvas-narrate 4 pass; test:modules 4959 pass with one unrelated failure (packages/process git-async cleanup grace under machine load; 5 pass when rerun alone); test:repository 169 pass; lint:all, type-check and format:check exit 0. Browser lane exit 0 for voice-box-presented (2), voice-box, canonical-model-narration, codex-live-voice and canonical-model-presentation. Replay owners canonical-walkthrough-replay and walkthrough-render 4 pass.
Visual check: a scratch script over the fake Codex stepped the motion clock and captured 38 frames of the launch and the return at 1920x1080 in both themes. The first capture showed the return fading out mid-air, because the fake's stopping stage lasts under 64ms; the stage now lets a flight bound for the waiting socket land lit, and the next capture showed the orb landing in the seat at 680ms and fading to the gold disc.
Out of write scope: apps/web/tests/ui/support/canvas/stage-harness.tsx wraps panes in OrbStageProvider (the Narrate key now needs the stage); apps/web/src/ui/walkthroughs/replay/components/ReplayStage.tsx uses RecordedOrb (interface width, ADR 0058); .impeccable/design.json mirrors the DESIGN.md text.
Known limits: two presented panes each have a Narrate key, and only the newest holds the orb, so the older key shows an empty seat while voice is off, and a press on it launches from the newest key. A Narrate press whose narration is then refused (the reading did not reach the server) leaves the launch armed until an orb is lit or the key goes.

Criterion 3's dock path got its own unit test (a launch with subtitles off lands in the dock): the orb tests are 35 pass, and lint and format:check exit 0 after it. Status stays In Progress until the owner reviews the transition and the three edits outside the write scope.

2026-11-07, coordinator, on the integrated branch: the known limit of two presented panes is fixed (commits 2e3ab4ff4 and 5ceecf69d). A press of Narrate makes its own key the stage's newest narrate socket, so the dark orb moves into it first, the orb leaves that key, and it comes back there as voice ends. Every key that can narrate draws its gold disc. While voice is on a held key draws it only while the orb is in its socket, so criterion 2 holds for the key the orb left, and the other key of a second pane shows an empty seat only while voice is on. A new unit test (the older of two keys) fails without the change and passes with it. Screenshots of two presented panes show both gold circles in both themes. Reduced motion was checked in a real browser: a throwaway copy of the Narrate browser test with prefers-reduced-motion found no frame in the air on the way into the box or back. The browser owners voice-box-presented (2) and voice-box (1) pass. The Replay stage's anchor in the model now names RecordedOrb (1407c2da9).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A presented walkthrough's Narrate key is now the voice orb's third home, so the key and the voice box share one element. While voice is off the dark orb waits in a key's gold circle. Pressing Narrate makes that key the orb's home and launches the next lit orb out of its circle, lit from the start of its flight, into the voice box, or the dock while subtitles are off. As voice ends the orb flies back to the key it left and fades there. Every key that can narrate draws its gold disc; while voice is on, a key draws it only while the orb is in it. Reduced motion, a home off screen and fullscreen cut the flight or keep it inside the presented element.

The stage keeps sockets per home, newest last, and a launch offers the pressed key's socket again. Page geometry moved to orb-screen.ts. To fit ADR 0058's ceiling, the replay's orb assembly became one RecordedOrb export.

Verified by unit tests of the stage and the narrate home (36 pass), the browser owners voice-box-presented and voice-box, a reduced-motion run of the Narrate browser test, and screenshots of one and two presented panes in both themes. Risk: a Narrate press whose narration is then refused leaves the launch armed until an orb is lit or the key goes. The owner reviews the transition in the PR.
<!-- SECTION:FINAL_SUMMARY:END -->

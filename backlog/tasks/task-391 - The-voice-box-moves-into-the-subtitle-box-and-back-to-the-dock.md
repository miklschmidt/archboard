---
id: TASK-391
title: The voice box moves into the subtitle box and back to the dock
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-04 11:27'
updated_date: '2026-10-04 11:28'
labels:
  - ui
dependencies: []
references:
  - docs/design/operator-canvas-shell.md
  - docs/adr/0041-a-recording-is-a-talk-rendered-frame-by-frame.md
documentation:
  - DESIGN.md
priority: high
type: feature
ordinal: 680000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User direction 2026-10-04, after the pane sidebar work (TASK-390): "when the subtitles are enabled, I want the voice box to be inside the subtitle box. Make that really cool, and make the words appear slowly, like a fade in. Make sure that it looks incredible. If subtitles are turned off, I want it back in the sidebar: if you click the button to disable the subtitles, it should smoothly transition from the subtitle box into the sidebar box."

Today the voice has one home. While voice is on, the agent dock at the foot of the navigator holds the voice circle (the gold ring and the lines of light), the voice's word, mute and the subtitles control. The subtitles are a separate box laid over the voice's pane. Its words appear in 150 ms and a cue is swapped whole, and the box vanishes at once when the voice stops talking. The two never meet, so somebody who reads the subtitles looks away from the picture to see whether the voice listens, speaks or is muted, and the one control that turns the subtitles off is not where they are read.

What the code and DESIGN.md already fix, so the work does not rediscover it:

- The Talk key, the voice circle and the circle that ends voice are one button, and the dock's motion plays its plate from key to circle (use-dock-motion). The orb is a canvas whose lines are a record of the last second of the model's output level, so the orb must move as one element: a second canvas would start dark and flat.
- The subtitle box measures its own width to cut a cue into two lines (TASK-307), is hidden from assistive technology, and takes no pointer input from the picture under it. A replay of a kept talk (src/ui/walkthrough-replay) draws the same captions frame by frame on a stepped clock, so nothing in the captions may read the browser's timers.
- A presented walkthrough carries its own voice controls in the presentation bar, and a recording page has no dock. Both keep plain captions.
- The Still Shadow Rule says nothing over the picture loops, blurs or filters. The orb loops while voice is on, on a canvas of its own, so DESIGN.md has to say that and keep every other part of the rule.
- Every duration lives in src/shared/timing, with what it pulls against.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 While subtitles are on and a voice session is live in a pane that is not presented, the voice box lies over that pane's picture: the voice orb, the voice's state in words, mute and the subtitles control, and the words the voice says beside the orb. The dock then draws no circle: its key reads End voice, is the same button that ends voice, and keeps keyboard focus as the layout changes.
- [ ] #2 While subtitles are off, while a walkthrough is presented, and on a recording page, nothing of the voice box is drawn over the picture. The orb is then the circle at the head of the dock, as before, and a presented pane and a recording show plain captions.
- [ ] #3 Turning subtitles off or on moves one orb, in one continuous flight between the dock's circle and the voice box, over a canvas that is never remounted, so its light and the level it has drawn carry over. The dock's key turns into the circle as the orb arrives and the circle into the key as it leaves, the box enters and leaves with it, the opposite choice during a flight turns it round from where it is, and reduced motion cuts.
- [ ] #4 The words fade in one at a time, slowly enough to be seen arriving without making the caption lag the voice. A caption that ends fades out, and one cue replaces another without a hard cut. A cue is still cut to the two measured lines, and the replay of a kept talk draws the same captions on its stepped clock.
- [ ] #5 Focus follows the subtitles control that was used to its other place, and nothing else loses focus. The box's controls are named and reachable by keyboard, and the rest of the box takes no pointer input from the picture under it.
- [ ] #6 DESIGN.md says what loops over the picture (the orb, on its own layer, only while voice is on) and keeps the rest of the Still Shadow Rule: nothing blurs or filters the picture and every shadow is still. The durations are in src/shared/timing with what each pulls against.
- [ ] #7 The page opened with ?voiceDemo shows the whole behaviour without Codex: the voice box over the first pane with a scripted transcript, and the flights both ways when the subtitles control is pressed.
- [ ] #8 Seen in a browser at 1920×1080 in both themes: the box idle and speaking, the dock in both layouts, and frame sequences of the flight to the box and back. An independent reviewer drives every state and each finding is fixed or answered in the task.
- [ ] #9 The touched files have no new lint or type finding, the stage, the dock layouts, the box and the captions have module tests, and every lane that passes on a clean HEAD still passes.
- [ ] #10 DESIGN.md, docs/design/operator-canvas-shell.md and the capture in docs/design/assets describe the result.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Motion thesis. Focal moment: the orb's flight, one continuous move of one canvas between the dock's circle and the voice box, while the dock's key turns into the circle as the orb arrives and the circle into the key as it leaves. Continuity: the box enters and leaves with the flight, and one cue gives way to the next. Feedback: each word fades in once. Budget: only the orb loops, on a canvas of its own, only while voice is on. Everything else eases once, as its own layer's opacity and transform. No filter or blur, every shadow still. DESIGN.md's Still Shadow Rule is revised to say that.

Model. The voice has two homes, and where it rests is a pure function of three facts: subtitles are wanted (the preference), voice is live (the stage is not idle), and a box is available (a session exists for the pane and nothing is presented). The dock, the box and the stage all derive from it, so there is no second state to keep in step.

1. Timing. VOICE_FLIGHT_MS, VOICE_BOX_IN_MS, VOICE_BOX_OUT_MS, CAPTION_WORD_MS, CAPTION_SWAP_MS and CAPTION_OUT_MS in src/shared/timing/lib/voice-motion.ts, exported through voice.ts, each with what it pulls against.
2. Orb stage (src/ui/voice-orb). createOrbStage holds the one holder of the orb's canvas, a garage for it while no home is offered, the offered slots and the wanted home. It lands the holder in the wanted slot, or flies it there in a fixed layer over the page, by a pure flight (orb-flight.ts). The flight meets the slot's live box each frame, so a slot that is itself moving (the plate forming, the box rising) is met. The opposite wish turns a flight round from where it is. It cuts when motion is not wanted, when an end is not on screen, and when a slot is withdrawn while it holds the orb. OrbStageProvider, OrbSlot, OrbHost (the portal that draws the one VoiceOrb into the holder) and useOrbPlacement. The orb's light goes to any host marked as lit by it, not only the dock.
3. Captions (src/ui/voice-subtitles). Captions is the cue's own paragraph, measured as now, with a slow word fade, the last cue kept while it fades out, and the cue before it fading under the next. VoiceSubtitles is Captions inside the glass it has today, for the replay and for a presented pane. useVoiceBoxed says whether the voice sits in the box. SubtitlesToggle hands keyboard focus to its twin when it is pressed with focus.
4. Dock (src/ui/workbench). VoiceControl draws the key as End voice while the box carries the voice and the circle only while the orb is home in the dock (data-form). It offers the dock's socket and hosts the orb. AgentDock takes captionable, makes the circle layout of live and not captioned, passes that to the dock's motion, and leaves out the voice line while the box has it.
5. Voice box (src/ui/workbench VoiceBox). The glass over the pane's picture with the orb's socket, the status word, the captions, mute and the subtitles control. Click-through except its controls, entering and leaving with the flight, and mounted while it leaves. PaneSubtitles draws the box, or plain captions while a walkthrough is presented or on a recording page.
6. Application root. OrbStageProvider, and the voice surface (the voice and the actions the box reads, held in a context so the pane's overlay is not made again for each stage). captionable is a session existing with nothing presented, and goes to the dock and the overlay.
7. Demonstration. ?voiceDemo also puts the voice box over the first pane, with a scripted transcript that the cycle speaks, so both flights can be watched without Codex.
8. Styles (app.css). The dock's two forms by data-form, the orb holder's fade, the flight layer, the voice box, the word fade and the orb's wash in the box (--lit). Reduced motion cuts.
9. Tests. The flight (endpoints, no overshoot). The stage (one canvas across both homes, cut, interrupted, withdrawn slot, a slot that is not there yet). The dock in both layouts. The box (controls, presence, the home follows the preference). Captions (the fade marks, the kept cue, the replay's captions unchanged). The focus relay. The choice PaneSubtitles makes.
10. Docs. DESIGN.md (Elevation and the Still Shadow Rule, Agent dock, a Voice box section), operator-canvas-shell.md and the capture.
11. Verify. Type check, lint on the touched files, the module lanes, and headless captures in both themes with frame sequences of both flights, driven through ?voiceDemo.
12. Review. Independent reviewers drive every state in a browser and report. Each finding is fixed or answered here.

Board proposal: Browser application@TASK-391 adds the part Voice orb and the relationships Workbench client to Voice orb and Workbench client to Voice subtitles, and revises Voice subtitles. Adopt it at closing, corrected to what was built.
<!-- SECTION:PLAN:END -->

---
id: TASK-391
title: The voice box moves into the subtitle box and back to the dock
status: Done
assignee:
  - '@claude'
created_date: '2026-10-04 11:27'
updated_date: '2026-10-04 13:23'
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
- [x] #1 While subtitles are on and a voice session is live in a pane that is not presented, the voice box lies over that pane's picture: the voice orb, the voice's state in words, mute and the subtitles control, and the words the voice says beside the orb. The dock then draws no circle: its key reads End voice, is the same button that ends voice, and keeps keyboard focus as the layout changes.
- [x] #2 While subtitles are off, while a walkthrough is presented, and on a recording page, nothing of the voice box is drawn over the picture. The orb is then the circle at the head of the dock, as before, and a presented pane and a recording show plain captions.
- [x] #3 Turning subtitles off or on moves one orb, in one continuous flight between the dock's circle and the voice box, over a canvas that is never remounted, so its light and the level it has drawn carry over. The dock's key turns into the circle as the orb arrives and the circle into the key as it leaves, the box enters and leaves with it, the opposite choice during a flight turns it round from where it is, and reduced motion cuts.
- [x] #4 The words fade in one at a time, slowly enough to be seen arriving without making the caption lag the voice. A caption that ends fades out, and one cue replaces another without a hard cut. A cue is still cut to the two measured lines, and the replay of a kept talk draws the same captions on its stepped clock.
- [x] #5 Focus follows the subtitles control that was used to its other place, and nothing else loses focus. The box's controls are named and reachable by keyboard, and the rest of the box takes no pointer input from the picture under it.
- [x] #6 DESIGN.md says what loops over the picture (the orb, on its own layer, only while voice is on) and keeps the rest of the Still Shadow Rule: nothing blurs or filters the picture and every shadow is still. The durations are in src/shared/timing with what each pulls against.
- [x] #7 The page opened with ?voiceDemo shows the whole behaviour without Codex: the voice box over the first pane with a scripted transcript, and the flights both ways when the subtitles control is pressed.
- [x] #8 Seen in a browser at 1920×1080 in both themes: the box idle and speaking, the dock in both layouts, and frame sequences of the flight to the box and back. An independent reviewer drives every state and each finding is fixed or answered in the task.
- [x] #9 The touched files have no new lint or type finding, the stage, the dock layouts, the box and the captions have module tests, and every lane that passes on a clean HEAD still passes.
- [x] #10 DESIGN.md, docs/design/operator-canvas-shell.md and the capture in docs/design/assets describe the result.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Motion thesis. Focal moment: the orb's flight, one continuous move of one canvas between the dock's circle and the voice box, while the dock's key turns into the circle as the orb arrives and the circle into the key as it leaves. Continuity: the box enters and leaves with the flight, and one cue gives way to the next. Feedback: each word fades in once, slowly. Budget: only the orb loops, on a canvas of its own, only while voice is on, and the box's wash follows its light on the box's own layer. Everything else eases once, as its own layer's opacity and transform. No filter or blur, every shadow still. DESIGN.md's Still Shadow Rule is revised to say that.

Model. The voice has two homes, and where it rests is a pure function of three facts: subtitles are wanted (the preference), voice is live (the stage is not idle), and a voice box is on the page (the box has offered its socket to the orb's stage). The dock, the box and the stage all derive from it, so there is no second state to keep in step. The application root decides only where the box may be drawn (a pane has a voice owner, nothing is presented, the page is not a recording), which is the overlay's input and not the dock's.

1. Timing. VOICE_FLIGHT_MS, VOICE_BOX_IN_MS, VOICE_BOX_OUT_MS, SUBTITLE_WORD_MS, SUBTITLE_SWAP_MS, SUBTITLE_OUT_MS, SUBTITLE_BACK_MS, VOICE_WORD_IN_MS and VOICE_DEMO_TICK_MS in src/shared/timing/lib/voice-motion.ts, exported through voice.ts, each with what it pulls against.
2. Orb stage (src/ui/voice-orb). createOrbStage holds the one holder of the orb's canvas, a garage for it while no home is offered, the offered sockets and the wished home. It lands the holder in the wished socket, or flies it there in a fixed layer over the page, by a pure flight (orb-flight.ts). The flight meets the socket's live box each frame. The opposite wish turns a flight round from where it is. A socket withdrawn while it holds the orb, or while the orb flies to it, leaves the orb where it was and it goes on from there to the next socket offered. It cuts when motion is not wanted and when an end is not on screen. A dark orb waits in a home and is lit after its style has settled. The stage says whether a home is on the page (offered, subscribe, useOrbOffered) and tells the orb's runner when it has landed. OrbStageProvider, OrbSlot, OrbHost and useOrbPlacement. The orb's light goes to any host marked as lit by it.
3. Subtitles (src/ui/voice-subtitles). SubtitleWords is the cue's own paragraph, measured when its face has loaded and again when its width changes (useMeasuredLines), with a slow word fade, the last cue kept while it fades out, and the cue before it fading under the next if it was being read. VoiceSubtitles is SubtitleWords inside the glass it has today, for the replay and for a presented pane. useVoiceBoxed says whether the voice sits in the box. SubtitlesToggle gives keyboard focus to the control that took its place when it was pressed with focus and lost it.
4. Dock (src/ui/workbench). VoiceControl draws the key as End voice while the box carries the voice and the circle only while the orb is home in the dock (data-form). It offers the dock's socket and hosts the orb. AgentDock asks the stage whether the box is on the page, makes the circle layout of live and not boxed, passes that to the dock's motion, and leaves out the voice line while the box has it.
5. Voice box (src/ui/workbench VoiceBox). The glass over the pane's picture with the orb's socket, the status word, the words, mute and the subtitles control. Click-through except its controls, capped to the pane's free width, entering and leaving by transitions, mounted and inert while it leaves. PaneSubtitles draws the box, or plain subtitles while a pane is presented or on a recording page, from a VoiceFeed so a transport is not needed to test it.
6. Application root. OrbStageProvider, and the voice surface (the voice and the actions the box reads, held in a context so the pane's overlay is not made again for each stage). voiceBoxAvailable (application/voice-box-available.ts) goes to the overlay. The pane's overlay lies over a page of the board and keeps clear of a sidebar that floats.
7. Demonstration. ?voiceDemo also puts the voice box over the active pane, with a scripted transcript that the cycle speaks, so both flights can be watched without Codex.
8. Styles (app.css). The dock's two forms by data-form, the orb holder's fade, the flight layer, the voice box, the word fade and the box's wash (--lit). Reduced motion cuts.
9. Tests. The flight. The stage (one canvas across both homes, cut, interrupted, withdrawn socket, a box that moves, a dark orb, offered). The dock in both layouts. The box (controls, presence, turned round while it leaves, inert while it leaves). Subtitles (the fade marks, the kept cue, no ghost of a cue that was fading, the replay's subtitles unchanged, focus). The choice PaneSubtitles makes, and the rule voiceBoxAvailable. The browser owner voice-box.
10. Docs. DESIGN.md (Elevation and the Still Shadow Rule, Agent dock, a Voice box section), CONTEXT.md, operator-canvas-shell.md, the acceptance doc and the capture.
11. Verify. Type check, lint on the touched files, the module, system and repository lanes, the browser owners, and headless captures and frame traces in both themes of both flights, driven through ?voiceDemo.
12. Review. Independent reviewers read the diff by scope and across their boundaries, and a visual driver drives every state in a browser and reports. Each finding is fixed or answered in the notes.

Board proposal: Browser application@TASK-391 adds the part Voice orb and the relationships Workbench client to Voice orb and Workbench client to Voice subtitles, and revises Voice subtitles. Adopt it at closing, corrected to what was built.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Built in b85eb978, review answered in 07a51b86. Review: five reviewers read the diff by scope and across the boundaries between scopes, and a sixth drove every state in a real browser (built from b85eb978). Each finding below is fixed or answered.

Fixed in 07a51b86.
- Focus was lost after a quick hide and show: the box stays mounted while it leaves, so its control never mounted again to take the focus handed on. Focus now goes to the control that took the pressed one's place, looked for once the surfaces have settled, and not at all when the pressed control kept it (a presentation bar's). The 1000ms relay timer and its module are gone, and with them a duration written outside src/shared/timing.
- A pane with no board has a voice owner but no overlay, so the dock gave the voice up to a box that never came. The dock now asks the orb's stage whether the box offered its socket. Seen in a browser on an empty vault: the circle is at the head of the dock, the orb is at home, mute and subtitles are there, and there is no box.
- A page of the board (z 20) covered the overlay (z 10), so the box was invisible with its controls still focusable. The overlay is above a page. Seen in a browser with the Parts page open.
- The box did not fit a narrow pane and ran under a floating sidebar, where its controls could not be reached and the dock had none. It is capped to the pane's free width, its words give way before the orb and the controls, the line breaks are measured again when its width changes, and it keeps clear of a floating sidebar. Seen at 1920x1080 with two panes: the box is 735px in a 799px pane, 515px in a 579px pane with the conversation open, and ends at x 808 beside a sidebar that starts at x 840, with both controls hit by a pointer.
- The box blinked when a flight was turned round: removing data-leaving swapped one keyframe animation for another, which restarted from nothing. Both are transitions now, with the arrival in @starting-style. Measured: turned round 150ms after hiding, the box's opacity falls to 0.70 and comes back to 1.00, the largest drop in one frame is 0.076, and the orb reverses without a jump in position.
- The words came in too fast: 74% visible after 100ms. They fade over 640ms with a slow-start, slow-arrive ease. Measured: 0.07 at 100ms, 0.20 at 150ms and 0.53 at 250ms. The voice's word now leaves as fast as the words return, and the two are never both on screen: the worst overlap of what is visible is 0.105.
- The dock snapped a few pixels at the end of its glide from the box to the dock. The conversation's control eased its size while the dock measured where its parts would settle. Its size does not ease now. Measured: the dock goes from 259px to 239px without a step at the end, and the orb lands on 887.0 exactly.
- Words that had begun to fade out came back under the next ones. A cue that was no longer being said leaves no lines under the next.
- The orb appeared at full opacity on its first frame at voice start. The stage lets its style settle before it lights a holder it has moved. Measured: opacity 0 on the first frame, 1 at 400ms of a 680ms flight, with the key's label on one line.
- The key's label wrapped while it morphed. A muted key kept the gold edge (a more specific selector). Mute was live where it does nothing, and is dimmed while the voice is starting or ending. A tip opened over the fading box: the box is inert while it leaves, and the tip closes.
- The dock's demonstration clock and the box's disagreed in ?voiceDemo=cycle: both tick at VOICE_DEMO_TICK_MS now.
- The word caption means the walkthrough's step text in this repository. Subtitles and the box no longer use it, in code or in docs.
- Durations written outside src/shared/timing are in it: the paragraph's quick return, the voice's word, the demonstration's tick.
- A voice box that moves to another pane takes the orb on from where it was, and the orb never stops in the dock. A dark orb waits in a home, never out of sight. A room the orb has left lets go of its light.
- Docs: the Still Shadow Rule names the box's wash, the voice's word is the accent text (ink on chalk, gold on graphite), the launch flight from the key is described, the acceptance doc names the dock and the box and not the agent bar and the wave.
- Tests added or changed: the rule voiceBoxAvailable, a voice heard over a transport (a stand-in feed), a box wanted again while it leaves, the box inert while it leaves, focus when the pressed surface stays on the page and when it is pressed twice at once, a control that keeps focus keeps it, no ghost of a fading cue, a box that moves, a dark orb, a home that says it is on the page. The browser owner counts every orb canvas, reads the subtitle's words without the fading cue, and presses Enter on the subtitles control twice in a real browser.

Answered, not changed.
- Entering or leaving a presented pane while the voice speaks draws the words again in a new paragraph, so the cue being said is blank until the next word, under half a second in speech. The fix lifts the watch state out of the paragraph and adds a prop for it, for a moment nobody has asked about, so it stays.
- Resizing the window during a flight moves the orb in one frame, which follows from meeting the socket where it is. The shell is fixed at 1920x1080.
- A real Codex voice was not run: there is no session here. The real-voice path is held with a stand-in feed, and the flights, the box and the words with ?voiceDemo.

Validation at 07a51b86.
- Type check (both projects) and both lint lanes are clean on every touched module, and the format check is clean. The policy lint over all of src/ui has findings in src/ui/semantic-board-canvas files this task did not touch; none is in a touched file.
- Module lane: 3892 pass, 5 fail. The same 5 fail at 474875ec, before this task: pane-news (2 tests), semantic-board-inspection, semantic-board-levels and navigator-tree.
- System lane: 189 pass. Repository lane: 8 pass.
- Browser owners, one at a time against the current build. Pass: voice-box, semantic-board-viewer, semantic-status-legibility, semantic-board-inspection, semantic-board-groups, semantic-walkthrough-presentation, semantic-drill-boundary, semantic-drill-address, semantic-board-exploring, semantic-claim, browser-drawn-pictures, semantic-traffic, and two of the three tests in workspace-address. Fail, and fail the same way at 474875ec: shell-layout (fixedpoint never becomes the visible board), the third test of workspace-address (choosing a variant in the navigator), measured-text, opener-settings, and codex-text-workbench and codex-live-voice, which time out at 30s looking for the agent bar's old selectors.
- The new tests catch what they are for: reverting the rule that a cue that was fading leaves no lines under the next, or the rule that a control that kept focus keeps it, fails the test of each.
- Seen at 1920x1080 in headless Chromium with ?voiceDemo, both themes: the box idle and speaking, the flight to the dock mid-air, the dock in both layouts, two panes with the conversation open, a floating sidebar, a page of the board over the picture, an empty vault, a presented pane and its exit, reduced motion. Frame traces of the flights both ways end on the socket's middle, which the browser owner holds to within a pixel, and the voice's start and end leave no orb or box behind.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
While subtitles are on, the voice sits in a box over the picture of the pane it runs for: the orb, the voice's state in a word, the words it says, mute and the subtitles control. The dock is calm and its key reads End voice. Turning subtitles off flies the one orb, one canvas that is never remounted, to the circle at the head of the dock and takes the box away, and turning them on flies it back. The dock's key turns into the circle as the orb arrives, a flight is turned round from where the orb is, and reduced motion cuts. The words fade in one at a time over 640ms, a full cue gives way to the next, and a subtitle that ends fades out. A presented pane and a recording keep plain subtitles. The box fits narrow panes, lies over a page of the board and keeps clear of a floating sidebar. Keyboard focus follows the subtitles control. DESIGN.md, CONTEXT.md, operator-canvas-shell.md, the acceptance doc and the capture describe it, and Browser application@TASK-391 is adopted as the architecture.

Verified in b85eb978 and 07a51b86: type check, lint on every touched module and the format check are clean. Module lane 3892 pass with the 5 failures that also fail at 474875ec, system lane 189 pass, repository lane 8 pass. The voice-box browser owner passes in headless Chromium: one orb resting in its socket in both homes, a box that takes no pointer input except at its two controls, flights both ways, and Enter on the subtitles control pressed twice. Every other browser owner gives the result it gives at 474875ec. Five reviewers and a browser driver reviewed it, and each finding is fixed or answered in the notes.
<!-- SECTION:FINAL_SUMMARY:END -->

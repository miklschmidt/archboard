---
id: TASK-392
title: >-
  A presented walkthrough is one box with the voice at its foot, in the pane and
  in fullscreen
status: Done
assignee:
  - '@claude'
created_date: '2026-10-04 14:53'
updated_date: '2026-10-04 16:50'
labels:
  - ui
  - voice
dependencies: []
references:
  - docs/design/operator-canvas-shell.md
  - TASK-391
  - TASK-358
documentation:
  - DESIGN.md
priority: high
type: feature
ordinal: 681000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User direction 2026-10-04, after TASK-391: "Now i just noticed you've completely forgotten about fullscreen presentation mode? Also please /impeccable redesign the walkthrough box and integrate the subtitles/voicebox into that walkthrough box at the bottom. The current walkthrough box is really bad and kind of thrown together, don't be afraid to start over."

Why. The caption of a presented walkthrough is a strip across the foot of the pane. Its heading and words sit on the left, and its controls hang in a loose column on the right: Narrate, Esc, the step dots and the two arrows. The voice box floats over the picture just above it, so the words of a step and the words of the voice are two unrelated objects, and the voice box can cover cards that the step is about. TASK-391 also left out fullscreen presentation. Its bar still carries the Talk control from before the orb: a small wave, a word, mute, subtitles and End. The subtitles there are plain glass with no orb, and no dock exists to fly the orb to.

What the code and DESIGN.md already fix, so the work does not rediscover it:

- The camera keeps a presented step's subjects clear of the caption by the caption's measured height (use-caption-reserve). Whatever sits inside the box is kept clear. What floats outside it is not.
- A recording page steps a walkthrough alone and nobody can press anything in the video, and the replay of a kept talk draws the same caption frame by frame on a stepped clock. Both lay plain subtitles over the picture, and neither has a dock, an orb or controls. TASK-358 reports that those subtitles cover subjects of the step.
- The orb is one canvas with two homes, the dock's circle and the voice box's socket (src/ui/voice-orb). A home can be anywhere on the page, and a flight meets its socket where the socket is.
- A walkthrough's Narrate control is in every pane in every state, and it is dimmed with the reason in its tooltip while a narration cannot start, so what is around it never moves.
- Fullscreen presents the shell's stage element. The navigator and the agent dock are not on screen, so the dock is not a home for the orb there.

Assumptions. This session could not ask the interview questions of the impeccable flow, so these are choices to confirm: the box keeps the walkthrough's name, the step's number, heading and words, and the controls that step and leave; the voice is at its foot; in fullscreen the voice stays in the box whatever the subtitles preference says, because there is no dock to go back to, and the preference then decides only whether words are drawn.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A presented walkthrough is one box over the picture, at the foot of its pane. The box is as wide as the pane less the margin it keeps at its foot. It holds the walkthrough name, the number of the step among all of them, the step heading and words, the controls that go to the previous or next step and leave, and a way to choose any step. The words stand in a centred column, 64rem wide at most, with left aligned text. The same box is drawn in a pane, in fullscreen presentation, in a recording and in the replay of a kept talk. A recording and a replay draw it without controls.
- [x] #2 The voice is at the foot of the box while a walkthrough is presented, in a pill as wide as the words. With voice live and subtitles on, the foot holds the orb, the voice state in a word or the words it says, mute and the subtitles control. With voice off, it holds a Narrate control that says why when a narration cannot start. Starting voice with subtitles on lights the orb in the foot. Turning subtitles on flies the orb from the dock to the foot. Turning them off flies it back, as TASK-391 does for the free voice box.
- [x] #3 The camera keeps every subject of the step clear of the whole box, its foot included, so no subtitle covers a subject in a pane, in fullscreen, in a recording or in a replay. The box keeps the height of its longest step while voice starts, runs and ends and while steps change, so the picture does not move when voice or the step does.
- [x] #4 Fullscreen presentation gives the voice a home. The bar holds the exit control, the board name and one voice key that reads Talk and then End voice. While voice runs, the orb is in the foot of the walkthrough box, or in the voice box over the picture when no walkthrough is presented, whatever the subtitles preference is. With subtitles off, the box says what the voice is doing in a word where the words would be. The subtitles control turns the words on and off without moving the voice.
- [x] #5 Arrows, the Page keys, Home and End still step, and Escape still leaves, wherever focus is. Space steps too, except that it presses a control that has focus. Every control has a name, a state and a tooltip. A new step is announced politely, and a step that is chosen says which step it is. Every text meets WCAG 2.2 AA contrast in both themes, and the rail segments meet 3:1. The gold piece that marks the step shown is 2.5:1 in the light theme, so the number and aria-current name the step as well. With reduced motion every change in the box cuts. A recording and a replay cut too, so that a kept talk renders to the same frames every time.
- [x] #6 Seen in a browser at 1920×1080 in both themes: one pane alone, two panes side by side and fullscreen, with a short step and the longest step of the longest walkthrough in the vaults, and with voice off, connecting, speaking, muted and with subtitles off. An independent reviewer drives every state, and each finding is fixed or answered in the task.
- [x] #7 Tests hold the rule that decides where the voice sits and the box stepping and leaving, and the browser owner for the voice box covers a presented walkthrough and fullscreen. DESIGN.md describes the walkthrough box and the voice in fullscreen. CONTEXT.md carries any new term. The voice box section no longer says that a presented pane has plain subtitles. Every duration is in src/shared/timing.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Settle the box with the impeccable flow: composition A of three Codex comps (.impeccable/mocks/walkthrough-box, delegated pick because this session could not ask) and a direction contract in the surface brief.
2. The stage says where it lays an overlay (use-overlay-place: free over the picture, or at the foot of a presented walkthrough's box). The box has one plate: a rail of steps, the step number, heading and words with the walkthrough name, the keys that step and leave, and at its foot the voice pill (PresentationFoot) that holds the Narrate key while voice is off and what the shell lays over the picture while it is live.
3. The voice rule: the box is available in a presentation; where the dock is off screen (fullscreen) the box carries the voice whatever the subtitles preference says (use-voice-boxed, dockless); the overlay follows the presented pane; VoiceBox has a place (free or foot) and plain subtitles draw bare in the foot (recording and replay).
4. The fullscreen bar holds one voice key (Talk, then End voice) that reads the same voice surface as the box.
5. The camera keeps clear of the whole frame, so nothing the voice says covers a subject.
6. Tests: module tests for the rule, the stage and the key; the browser owners for presenting, the voice box and the live voice in the presentation bar.
7. Docs: DESIGN.md, CONTEXT.md, docs/design/operator-canvas-shell.md and its figure; the board proposal for Browser application.
8. Verify in a real browser in both themes (pane, two panes, fullscreen, long copy), review with parallel reviewers, then finalize.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Design decisions so far. The comp was picked by me (delegated): A, the plate, over B (full-width lectern) and C (margin card). The kicker above the heading is gone (an eyebrow is banned): the walkthrough name sits under the words. Fullscreen has no dock, so the voice box carries the voice there whatever the subtitles preference says, and the preference only decides whether words show. Opening a walkthrough while the voice box floats flies the orb from the box to the foot, and leaving flies it back (checked on frame sheets).

Found, not done: ui/voice-wave (the shader wave the bar used to carry) and the wave projection in voice-output-level have no product consumer now. A follow-up task should remove them. TASK-358 (a recording's subtitles cover subjects of the step) is answered for the presented box by the reserve, but its second criterion (lane headers on a data-flow view) is not touched.

Follow-ups made from what this task found: TASK-393 (the live voice browser owner is stale: it still reads the agent bar and the wave) and TASK-394 (the output wave has no surface that draws it).

The approved comp shows entity names in the step's words in bold. A step's words carry no markup and the board names no subjects inside them, so the box draws plain words: a deliberate adaptation. The comp's gold step number is ink here, because gold is for the step shown, the orb's ring and the voice (One Gold Rule).

The Browser application proposal is branched as TASK-392 (version 35): the four parts and two relationships this task changed are restated whole, and the voice orb, which TASK-391 drew with no place in the board, now has its parent, group and binding, as does the workbench client and the voice subtitles that the same edit had left without them.

User direction after the first build, in the order it came. The box spans the pane less the margin it keeps at its foot. The words stand in a centred column, 64rem wide at most, with left aligned text, and the voice pill is as wide as the words. The user then asked for a proper transition between steps and chose "the gold travels" from three proposals. The gold piece of the rail travels to the new step with a paler wake. The number rolls like a flip-board digit. The heading and words slide out and in. The hand-over takes 520ms, moves only transform and opacity, and the box keeps the height of its longest step.

A recording and a replay cut between steps. The system test for a kept talk failed on the first frame after a step change, because that frame was drawn a few milliseconds ahead of the frame clock. A trace showed every animation paused at zero on the main thread. The cause is that a transform or opacity transition starts on the compositor before the clock can hold it. A rule in app.css now switches the transitions of the box off under [data-recording]. The test passed three runs in a row after the change. The picture still glides in a recording, because the clock drives it.

Review. Four parallel reviewers (box, voice, tests, boundary) found these defects, and each is fixed: the orb flight was invisible in fullscreen, focus was left on nothing when the box opened, Space stepped while a control had focus, icon controls had no tooltips, the rail was below 3:1, some text was stale, and one words test could not fail. The impeccable finish reviewer first returned fix with five findings. After the recapture it scored all five resolved, listed no material breakage, and returned ship. That verdict covers its five findings and the layout and hand-over direction as captured. It is not a new hunt of the whole surface.

Deviations. The comp bolds entity names in the words, but the step words are plain text, so the box draws plain words. The comp has a gold step number, but here it is ink, because gold marks only the step shown, the orb ring and the voice. The gold piece is 2.5:1 on Card White in the light theme. So the number, the heading and aria-current name the step as well. The words measure is now a column of 64rem, as the user asked, in place of 66 characters.

The documenter found drift that was already there and left it alone. DESIGN.md still names the branch prototype/shell-worlds. Its frontmatter type roles omit nav, presentation, subtitle, reading and figure. The sidecar .impeccable/design.json keeps the old Still Shadow Rule body and lacks two rules of DESIGN.md.

Validation, run on the final tree. type-check, lint:tests and the repository tests pass. The module tests give 3906 pass and 5 fail, and the same 5 fail at HEAD. The system lane gives 189 pass and 0 fail, with the kept-talk render test passing. I ran the browser owners one by one, because the serial lane stops at its first failure. 14 of 19 pass, including semantic-walkthrough-presentation, voice-box and voice-box-presented. The other five fail the same way on a clean checkout of HEAD: shell-layout and one test of workspace-address use selectors that no longer exist, measured-text finds a palette parity drift, codex-text-workbench waits on the same stale selector, and codex-live-voice is TASK-393.

Contrast, measured in the browser against what is behind each text run. Every text run in the box meets its threshold in both themes. Ink is 14.6 in dark and 19.1 in light, muted ink is 6.7 and 6.5, and the Narrate hint is 7.8 and 6.1. The rail segments are 4.0 in dark and 3.3 in light. The gold piece is 10.8 in dark and 2.5 in light.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
A presented walkthrough is now one plate over the foot of its pane. It is as wide as the pane less the margin at its foot. The words stand in a centred column up to 64rem wide, and the voice pill under them is as wide as the words. A rail of steps carries one gold piece that travels to the step shown. A step is handed to the next over 520ms, with transform and opacity only. The voice sits in the pill at the foot. This holds in a pane and in fullscreen, where no dock is on screen. The fullscreen bar holds one key that reads Talk and then End voice. The orb now flies inside the element that a fullscreen page paints. A recording and a replay cut between steps, so that a kept talk renders to the same frames every time. The Browser application board is adopted. DESIGN.md, the shell design document and its figure follow the build. Verified with module tests (3906 pass, and the same 5 fail at HEAD), the system lane (189 pass), 14 of 19 browser owners (the other 5 fail the same way at HEAD), contrast measured in the browser, captures in both themes, and the impeccable finish review, which returned ship. TASK-393 and TASK-394 are the follow-ups.
<!-- SECTION:FINAL_SUMMARY:END -->

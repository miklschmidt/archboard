---
id: TASK-392
title: >-
  A presented walkthrough is one box with the voice at its foot, in the pane and
  in fullscreen
status: In Progress
assignee:
  - '@claude'
created_date: '2026-10-04 14:53'
updated_date: '2026-10-04 15:18'
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
- [ ] #1 A presented walkthrough is one box over the picture, at the foot of its pane. It holds the walkthrough name, the number of the step among all of them, the step heading and words, the controls that go to the previous or next step and leave, and a way to choose any step. The same box is drawn in a pane, in fullscreen presentation, in a recording and in the replay of a kept talk. A recording and a replay draw it without controls.
- [ ] #2 The voice is at the foot of the box while a walkthrough is presented. With voice live and subtitles on, the foot holds the orb, the voice state in a word or the words it says, mute and the subtitles control. With voice off, it holds a Narrate control that says why when a narration cannot start. Starting voice with subtitles on lights the orb in the foot. Turning subtitles on flies the orb from the dock to the foot, and turning them off flies it back, as TASK-391 does for the free voice box.
- [ ] #3 The camera keeps every subject of the step clear of the whole box, its foot included, so no subtitle covers a subject in a pane, in fullscreen, in a recording or in a replay. The box keeps one height while voice starts, runs and ends, so the picture does not move when voice does.
- [ ] #4 Fullscreen presentation gives the voice a home. The bar holds the exit control, the board name and one voice key that reads Talk and then End voice. While voice runs, the orb is in the foot of the walkthrough box, or in the voice box over the picture when no walkthrough is presented, whatever the subtitles preference is. With subtitles off the box says what the voice is doing in a word where the words would be, and the subtitles control turns the words on and off without moving the voice.
- [ ] #5 Arrows, Space, the Page keys, Home and End still step, and Escape still leaves, wherever focus is. Every control has a name, a state and a tooltip. A new step is announced politely, a step that is chosen says which step it is, and every text and control meets WCAG 2.2 AA contrast in both themes. With reduced motion every change in the box cuts.
- [ ] #6 Seen in a browser at 1920×1080 in both themes: one pane alone, two panes side by side and fullscreen, each with a short step and the longest step of the longest walkthrough in the vaults, and with voice off, connecting, speaking, muted and with subtitles off. An independent reviewer drives every state and each finding is fixed or answered in the task.
- [ ] #7 Tests hold the rule that decides where the voice sits and the box stepping and leaving, and the browser owner for the voice box covers a presented walkthrough and fullscreen. DESIGN.md describes the walkthrough box and the voice in fullscreen, CONTEXT.md carries any new term, the voice box section no longer says that a presented pane has plain subtitles, and every duration is in src/shared/timing.
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
<!-- SECTION:NOTES:END -->

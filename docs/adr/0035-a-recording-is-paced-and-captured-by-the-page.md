---
status: superseded by ADR-0041
---

# A recording is paced by the voice and captured by the page that plays it

Agents in consumer repositories want to hand a user a video that explains an
architecture, such as the change that a pull request makes. The video is
narrated the way a walkthrough is narrated on the canvas. The user does not need
to sit through it live or to keep the board afterwards (TASK-304).

A recording is one walkthrough presented from its first step to its last with
nobody at the controls. The pane moves to each next step after the voice
finishes explaining the step on screen. The picture and the voice go into one
file. `archboard semantic record` makes one.

## The page decides when to move on

The page paces the steps, not the server. A final line is not the end of the
sound. The model can end its turn before its audio finishes playing, and only
the page hears the audio. The walkthrough position is the browser's anyway.

## The page records itself

The voice arrives as a WebRTC track that only the page receives, so the page
makes the file. The page captures its own tab with the screen capture of the
browser (`getDisplayMedia` with `preferCurrentTab`). The flag
`--auto-accept-this-tab-capture` accepts it without a prompt. The page mixes the
voice into one Web Audio track from its stream, because a headless tab's own
audio is silence. It writes both with `MediaRecorder`, as MP4 with H.264 or as
WebM with VP9. The picture is never encoded outside the browser.

The recording does not use Remotion. Remotion renders frames that it seeks to,
so everything on screen must move on a frame clock. The canvas moves on
wall-clock time (rAF glides, CSS transitions, the Web Animations API, SMIL
traffic). The voice is a live session, not audio known in advance.

Superseded (TASK-381, 2026-09-30). A recording is made in two passes: the live
talk, and then its picture rendered frame by frame.
[ADR 0041](0041-a-recording-is-a-talk-rendered-frame-by-frame.md) records this.

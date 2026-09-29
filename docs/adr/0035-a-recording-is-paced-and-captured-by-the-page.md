---
status: accepted
---

# A recording is paced by the voice and captured by the page that plays it

Amended by TASK-373 (2026-09-29): the recording page is a browser tab of its
own, so it has its own tab session, coordinator and voice session. Voice in
another tab no longer refuses a recording start, and a Talk in another tab no
longer ends a recording. This replaces the last two sentences of "It records on
the canvas the CLI talks to" below. Everything else stands.

Agents in consumer repositories want to hand a user a video that explains an
architecture, such as the change a pull request makes, narrated the way a
walkthrough is narrated on the canvas, without the user sitting through it live
or keeping the board afterwards (TASK-304). A **recording** is one walkthrough
presented from its first step to its last with nobody at the controls: the pane
moves to each next step once the voice has finished explaining the one on
screen, and the picture and the voice go into one file.
`archboard semantic record` makes one.

## The page decides when to move on

Narration waits for the user (ADR 0023, TASK-251), and a model-paced talk was
dropped because a V3 handoff carries too little for the voice model to steer a
presentation. A recording is paced by neither the user nor the model: the page
steps it by itself once the voice has finished speaking. A step is finished when
every line the voice said since the step was handed over is final in the
transcript (the voice model ended its turn, `turn.done`) and the voice's
measured output has stayed below speaking level for `RECORDING_QUIET_MS`.

- **The page, not the server.** A final line is not the end of the sound: the
  model can end its turn before its audio has finished playing, and only the
  page hears the audio. The walkthrough position is the browser's anyway.
- **Reported as the pane's own step.** A step the page moves to answers no
  request, so the pane reports it with `answering: null`, as it would a step
  chosen by hand, and the server hands it to the voice by the path every such
  step takes. The server gains no pacing of its own.
- **Bounded, and failed loudly.** A step that never arrives, a voice that says
  nothing about a step, a voice that talks about one step for minutes and a
  voice that stops all fail the recording with what happened. A silent step in
  a video is worse than no video.

A recording start differs from a narration start in four ways. The voice model
gets the voice's persona and a recording section, and none of the conversation
rules: the talk is recorded, nobody answers, it explains each step as it lands
and stops talking, since silence is what moves the screen on. The coordinator
gets its own rule for the session: a recording holds the voice, so it writes
only quiet commentary, and a workhorse outcome that arrives meanwhile is
injected into its thread instead of spoken into the video. The Realtime API's
delegation filler is off. And the server opens no step itself, because the page
begins capturing before it steps.

## The page records itself

The voice arrives as a WebRTC track that only the page receives, so the page
makes the file. It captures its own tab with the browser's screen capture
(`getDisplayMedia` with `preferCurrentTab`, accepted without a prompt by
`--auto-accept-this-tab-capture`), mixes the voice into one Web Audio track
from its stream (a headless tab's own audio is silence), and writes both with
`MediaRecorder`: MP4 with H.264, or WebM with VP9. The picture is never encoded
outside the browser. A page opened with `?record=<walkthrough>` shows its one
pane at the full 1920x1080 viewport and nothing else, with the caption's
controls dropped, and the recorder drives it through one global
(`@/shared/walkthrough-recording`).

- **Not Remotion.** Remotion renders frames it seeks to, so everything on screen
  would have to move on a frame clock. The canvas moves on wall-clock time
  (rAF glides, CSS transitions, the Web Animations API, SMIL traffic) and the
  voice is a live session, not audio known in advance.
- **Not a CDP screencast.** It gives frames without sound, which would have to
  be recorded separately and aligned by an encoder archboard does not ship.
- **Not `--use-fake-ui-for-media-stream`.** It turns tab capture into 20 fps
  screen capture on Chromium 153; the microphone is granted over DevTools
  instead, and the fake device plays a silent file, since its default tone is
  something the voice model would hear.

## It plays with sound wherever it is watched

A recording is most often attached to a pull request and watched in whatever
browser its reviewer has (TASK-305). `MediaRecorder` on Linux has no AAC
encoder, Google Chrome's included, so MP4 sound is Opus, and Safari plays an
Opus MP4 as a silent picture. So when an `ffmpeg` is at hand (`PATH`, or
`ARCHBOARD_FFMPEG`) the recorder converts the sound to AAC, copies the picture
untouched and moves the index to the front of the file. ffmpeg stays optional:
without one, or when it fails, the file is kept as recorded and the command says
that a Safari viewer would hear nothing and how to change it. Only an Opus MP4
is converted; a WebM, or an MP4 the browser wrote with AAC where the operating
system has an encoder, is handed over as recorded.

## It records on the canvas the CLI talks to

The voice needs a signed-in Codex, and a canvas's Codex home is held by one
app-server at a time. So a recording runs on the canvas the CLI already talks
to, in a private headless Chromium the recorder owns (ADR 0020), and not on a
second canvas of its own. That canvas may be in use in another browser, so the
recording page's pane registers as a recording's and the canvas leaves it out of
everything that picks a pane for somebody who did not name it: `browser` pane
addressing and listing, the pane count, a new tab's board and the coordinator's
notion of the pane the user looks at. The server still reaches it by its client
id. Other browsers do not subtitle a recording's words; the recording page
always does, above the caption, since the voice says more than the caption
and nobody watching the video can turn them on (TASK-306). A recording start is
refused while voice is live on the canvas: the canvas has one voice session, and
recording must never stop somebody who is talking. The reverse is allowed:
starting voice anywhere on the canvas ends a recording, and the recording says
so when it fails.

## A board made to be recorded can be discarded

`--discard` deletes the board once its recording is written; a failed recording
keeps it, so it can be recorded again. Deleting goes through the store under the
board's lease with a stated doing, like every write, and states the version the
command read before it recorded, so a board somebody changed meanwhile is kept.
A discard that is refused leaves the recording answered: the file is written,
and the receipt says the board was not discarded and why. There is no command
that deletes a board otherwise: a board is discarded because it was made to be
recorded, not tidied away.

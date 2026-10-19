---
status: superseded by ADR-0041
---

# A recording is paced by the voice and captured by the page that plays it

Amended by TASK-373 (2026-09-29). The recording page is a browser tab of its
own, so it has its own tab session, coordinator and voice session. Voice in
another tab no longer refuses a recording start. A Talk in another tab no longer
ends a recording. This replaces the last two sentences of "It records on the
canvas the CLI talks to" below. Everything else stands.

Amended by TASK-378 (2026-09-29). The capture keeps a steady rate. Chromium's
tab capture (`media::VideoCaptureOracle`) locks onto a screen region that
animates steadily. It then samples only frames that repaint that region. After
the animation stops, it ignores every other change for 250 ms.

A camera glide or cross-fade that ended while subtitles or traffic still moved
held the picture for up to 284 ms. Such a hold happened 4 to 10 times in a 100 s
recording. The recording stage therefore lays a layer behind its opaque
background. The layer repaints the whole frame on every frame. So the lock is
always on the whole frame and never ends.

The capture also names no frame rate. Chromium captures a tab at 30 frames a
second by default. A rate asked for also caps the track. That track then dropped
a frame a few times a recording. "The page records itself" below stands
otherwise.

Amended again by TASK-378 (2026-09-30). If the machine has a usable GPU, the
browser of the recording composites on it. Headless Chromium composites in
software unless it is started with `--enable-gpu`. During the glide under the
cross-fade of the veil, the software compositor was busy 520 of every 550 ms.
The capture then got a frame only every 40 to 75 ms. So the recorder starts
Chromium with `--enable-gpu` and `--disable-gpu-rasterization`.

The GPU composites, and rasterization stays in software. GPU rasterization held
the capture for 67 to 106 ms each time a step drew new content.

A machine without a usable GPU needs no flag of its own. Chromium then
composites in software, and the recording works as before. The GPU compiles the
shaders of an effect the first time it draws that effect. For the blurred scrim
of the subtitle box, this took 60 to 85 ms and held the first words. So the page
draws the subtitle box for two frames before it captures its tab. The file never
shows that box.

The rasterizer keeps `--disable-gpu`. Its pictures are still frames, and a PNG
must not depend on the GPU of the machine.

Agents in consumer repositories want to hand a user a video that explains an
architecture, such as the change that a pull request makes. The video is
narrated the way a walkthrough is narrated on the canvas. The user does not need
to sit through it live or to keep the board afterwards (TASK-304).

A recording is one walkthrough presented from its first step to its last with
nobody at the controls. The pane moves to each next step after the voice
finishes explaining the step on screen. The picture and the voice go into one
file. `archboard semantic record` makes one.

## The page decides when to move on

Narration waits for the user (ADR 0023, TASK-251). A model-paced talk was
dropped, because a V3 handoff carries too little for the voice model to steer a
presentation. Neither the user nor the model paces a recording. The page steps
it by itself after the voice finishes speaking.

Two conditions finish a step. First, every line that the voice said since the
step was handed over is final in the transcript. A line is final after the voice
model ends its turn (`turn.done`). Second, the measured output of the voice
stays below speaking level for `RECORDING_QUIET_MS`.

The page paces the steps, not the server. A final line is not the end of the
sound. The model can end its turn before its audio finishes playing, and only
the page hears the audio. The walkthrough position is the browser's anyway.

The pane reports the step as its own. A step that the page moves to answers no
request. So the pane reports it with `answering: null`, as it reports a step
chosen by hand. The server hands it to the voice by the path that every such
step takes. The server gains no pacing of its own.

The recording is bounded and fails loudly. Four things fail the recording with
what happened:

- A step that never arrives
- A voice that says nothing about a step
- A voice that talks about one step for minutes
- A voice that stops

A silent step in a video is worse than no video.

A recording start differs from a narration start in four ways:

- The voice model gets the persona of the voice and a recording section, and
  none of the conversation rules. The talk is recorded and nobody answers. The
  voice model explains each step as the step lands and stops talking, because
  silence moves the screen on.
- The coordinator gets its own rule for the session. A recording holds the
  voice, so the coordinator writes only quiet commentary. A workhorse outcome
  that arrives meanwhile is injected into its thread and not spoken into the
  video.
- The Realtime API's delegation filler is off.
- The server opens no step itself, because the page begins capturing before it
  steps.

## The page records itself

The voice arrives as a WebRTC track that only the page receives, so the page
makes the file. The page captures its own tab with the screen capture of the
browser (`getDisplayMedia` with `preferCurrentTab`). The flag
`--auto-accept-this-tab-capture` accepts it without a prompt. The page mixes the
voice into one Web Audio track from its stream, because a headless tab's own
audio is silence. It writes both with `MediaRecorder`, as MP4 with H.264 or as
WebM with VP9. The picture is never encoded outside the browser.

A page opened with `?record=<walkthrough>` shows its one pane at the full
1920x1080 viewport and nothing else. The controls of the caption are dropped.
The recorder drives the page through one global
(`@archboard/walkthrough/recording`).

The recording does not use Remotion. Remotion renders frames that it seeks to,
so everything on screen must move on a frame clock. The canvas moves on
wall-clock time (rAF glides, CSS transitions, the Web Animations API, SMIL
traffic). The voice is a live session, not audio known in advance.

The recording does not use a CDP screencast. It gives frames without sound. The
sound must then be recorded separately and aligned by an encoder that archboard
does not ship.

The recording does not use `--use-fake-ui-for-media-stream`. That flag turns tab
capture into 20 fps screen capture on Chromium 153. The microphone is granted
over DevTools instead. The fake device plays a silent file, because its default
tone is something that the voice model hears.

## It plays with sound wherever it is watched

A recording is most often attached to a pull request and watched in whatever
browser its reviewer has (TASK-305). `MediaRecorder` on Linux has no AAC
encoder, and that includes Google Chrome. So MP4 sound is Opus, and Safari plays
an Opus MP4 as a silent picture.

If an `ffmpeg` is at hand (`PATH`, or `ARCHBOARD_FFMPEG`), the recorder converts
the sound to AAC. It copies the picture untouched and moves the index to the
front of the file. ffmpeg stays optional. If there is no ffmpeg or it fails, the
file is kept as recorded. The command says that a Safari viewer hears nothing,
and says how to change it.

Only an Opus MP4 is converted. A WebM is handed over as recorded. So is an MP4
that the browser wrote with AAC where the operating system has an encoder.

## It records on the canvas the CLI talks to

The voice needs a signed-in Codex, and a canvas's Codex home is held by one
app-server at a time. So a recording runs on the canvas that the CLI already
talks to, in a private headless Chromium that the recorder owns (ADR 0020). It
does not run on a second canvas of its own.

Another browser can use that canvas at the same time. So the pane of the
recording page registers as a recording's pane. The canvas leaves that pane out
of everything that picks a pane for somebody who did not name it:

- `browser` pane addressing and listing
- The pane count
- The board of a new tab
- The notion of the coordinator of the pane that the user looks at

The server still reaches the pane by its client id.

Other browsers do not subtitle the words of a recording. The recording page
always does, above the caption. The voice says more than the caption, and nobody
who watches the video can turn subtitles on (TASK-306).

A recording start is refused while voice is live on the canvas. The canvas has
one voice session, and a recording must never stop somebody who is talking. The
reverse is allowed. Starting voice anywhere on the canvas ends a recording, and
the failure of the recording says so.

## A board made to be recorded can be discarded

`--discard` deletes the board after its recording is written. A failed recording
keeps the board, so it can be recorded again. The delete goes through the store
under the lease of the board, with a stated doing, like every write. It also
states the version that the command read before it recorded. So a board that
somebody changed meanwhile is kept.

A discard that is refused leaves the recording answered. The file is written,
and the receipt says that the board was not discarded and why. No other command
deletes a board. A board is discarded because it was made to be recorded, not
tidied away.

Superseded (TASK-381, 2026-09-30). A recording is made in two passes: the live
talk, and then its picture rendered frame by frame.
[ADR 0041](0041-a-recording-is-a-talk-rendered-frame-by-frame.md) records this.

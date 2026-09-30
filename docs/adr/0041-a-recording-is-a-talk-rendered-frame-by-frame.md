---
status: proposed
---

# A recording is a talk rendered frame by frame

When TASK-381 closes, this ADR supersedes
[ADR 0035](0035-a-recording-is-paced-and-captured-by-the-page.md) in full, and
ADR 0035 gets `status: superseded by ADR-0041`. The user decided the two passes
on 2026-09-30, after comparing Archboard's recorder with Remotion's capture
pipeline. The user also decided that the encoder is ffmpeg.

## Context

ADR 0035 made a recording in one live pass. The page paced the walkthrough on
the Codex voice and captured its own tab with `getDisplayMedia` and
`MediaRecorder`. So every frame depended on Chromium's tab capture and its
compositor. TASK-378 needed a repaint layer, GPU compositing and a shader
warm-up to keep held frames under 50 ms. A machine without a usable GPU still
held the picture for 57 to 75 ms in the glides between views. A busy machine
held it longer.

A walkthrough is paced by the voice, so the pacing needs a live pass. The
picture does not. It needs every frame drawn at its own time.

## Decision

A recording is made in two passes.

1. **Pass 1 records the talk.** The live page paces the walkthrough on the
   voice, as before. It captures no picture. It keeps the voice's sound and
   stamps each step, subtitle line and drawn board version on one clock.
2. **Pass 2 renders the picture.** The CLI opens a replay page in its own
   headless Chromium. The page draws the talk's board from the talk alone, on a
   clock that the CLI steps 1/30 s at a time. The CLI captures each frame and
   pipes it to ffmpeg with the voice. No Codex runs, and nothing is captured
   from a live screen.

So every frame is drawn, and no frame is dropped, with or without a GPU and
under any load. A kept talk can be rendered again, in the other theme or after
a renderer fix, with no new voice session.

## What stands from ADR 0035

These rules carry over unchanged. They are stated here so that ADR 0035 can be
retired.

### The page decides when to move on

A recording is paced by neither the user nor the model. When the voice stops
speaking, the page moves to the next step. Two conditions end a step. First,
every line that the voice said about the step is final in the transcript.
Second, the voice's measured output stays below speaking level for
`RECORDING_QUIET_MS`.

- The page decides, not the server. The model can end its turn before its
  audio stops playing, and only the page hears the audio.
- The pane reports the step as its own, with `answering: null`. The server
  hands it to the voice by the path that every such step takes. The server has
  no pacing of its own.
- A step that never arrives, a voice that says nothing about a step, a voice
  that talks about one step for minutes and a voice that stops all fail the
  recording loudly.

A recording start differs from a narration start in four ways:

- The voice model gets the voice's persona and a recording section, and none
  of the conversation rules.
- The coordinator writes only quiet commentary. A workhorse outcome that
  arrives meanwhile goes into its thread and is never spoken into the video.
- The Realtime API's delegation filler is off.
- The server opens no step itself, because the talk's clock starts before the
  first step.

### Pass 1 runs on the Archboard server the CLI talks to

The voice needs a signed-in Codex, and one app-server at a time holds a Codex
home. So pass 1 runs on the Archboard server that the CLI already talks to, in
a private headless Chromium that the recorder owns. The recording page's pane
registers as a recording's pane. Some server features pick a pane for somebody
who did not name one. The server leaves the recording's pane out of all of
them. It still reaches that pane by its client id. The recording page always
shows subtitles.

TASK-373 amended this rule, and the amendment stands. The recording page is a
browser tab of its own, with its own tab session, coordinator and voice
session. Voice in another tab does not refuse a recording start, and a Talk in
another tab does not end a recording.

The voice does not start without a microphone. So the browser of pass 1 starts
with a fake microphone, and with audio allowed to play. The recorder grants the
microphone over DevTools. The fake device plays a second of silence. Chromium's
default fake device plays a tone, and the voice hears that tone as somebody
speaking.

### A board made to be recorded can be discarded

`--discard` deletes the board once its recording is written. A failed
recording keeps the board. The delete goes through the store under the
board's lease, with a stated doing. It states the version that the command
read before it recorded. So a board that somebody changed meanwhile is kept. A
discard that is refused leaves the recording answered, and the receipt says
why the board was kept.

### The recording speaks one language

TASK-380 added this rule, and no ADR stated it until now.
`--language` names the language a recording is narrated in, as a BCP 47
language tag. English is the default. The command refuses a tag that names no
language before it starts anything (`RecordingLanguageSchema` in
`@/shared/walkthrough-recording`). The voice is told to speak only that
language, from its first word to its last, whatever language a step is written
in. Only a recording carries a language. A live narration speaks the user's
language.

## What is new

### The talk

A talk is a directory with two files, `talk.json` and `voice.wav`.
`TalkSchema` in `@/shared/walkthrough-recording` is its one contract, and both
the CLI and the replay page read it. `talk.json` holds:

- `format: "archboard-talk"` and `version: 1`, the time it was recorded, its
  language and its theme.
- The board: its name, its key (`name` or `name@variant`), the variant, the
  version, the walkthrough and its number of steps.
- The audio: 48 kHz, one channel, the number of samples, and the audio
  context's `baseLatencyMs`.
- The events, each stamped `at` a sample count from the origin. A `step` event
  names a beat. A `said` event is one change of an assistant line in the
  subtitled transcript. A `drawn` event names a drawn version. An `end` event
  closes the talk.
- The board document, parsed with `parseSemanticBoard`, and the vault policy,
  parsed with `VaultCheckSchema`. No second schema describes either.

The schema refuses a talk in three cases:

- Its beats are not 0 to the last step, once each and in order.
- Its last event is not `end`.
- A `drawn` version is not the board's version. Then the board changed while
  it was recorded. Pass 1 fails, and the error says to record again.

The talk is kept. Every `semantic record` writes it atomically, through a
temporary directory and a rename, to `recordings/<UTC stamp>-<board>/` in the
state directory. The newest 10 talks stay there. When a recording starts, the
recorder removes the older ones. `--talk <dir>` writes the talk to that directory
instead and never removes it. The directory must not exist, and the command
checks this before it starts anything. The talk is written before pass 2. If
pass 2 fails, the talk stays, and the error names the `semantic replay`
command that renders it again.

### How pass 1 records the talk

Talk capture (`src/ui/walkthrough-recording/lib/talk-capture.ts`) replaces the
tab capture. It makes one `AudioContext` at 48 kHz. The voice's stream goes
through a mix bus and an AudioWorklet tap into a gain of zero. The zero gain
keeps the tap running while nothing is heard. The voice's audio element stays muted.
Chrome needs the element to hand a WebRTC track's sound to Web Audio.

Every event is stamped with the audio context's own clock, in samples. A stamp
is late by at most one audio buffer, which is about 10 to 21 ms on Linux and
under one frame. The origin is the moment the voice goes live, where the video
begins. At the end, the tap cuts the audio to the origin and the end, so the
sound is exact to the sample against the stamps. The transcript's changes come
from the transport's subscription, not from the pacing tick, so a `said`
event keeps the timing that the subtitles saw.

The page hands the voice over as a 16-bit mono WAV and the event log by value.
It hands over no video.

### The replay page

The server serves one more page, `/?replay=1`, from the same static files. For
that address the entry point mounts the walkthrough replay
(`src/ui/walkthrough-replay`) in place of the application. The replay page
mounts no workbench, no pane session and no socket, so no Codex is involved. It
builds the same DOM as the recording page's pane: the recording stage, the
pane stage, the board stage and the subtitles over it.

The page reads the board only from the talk. The viewer's document and
vault-check queries read through one board-reads port, and the replay installs
the talk's snapshot there. So every refetch answers the same board, and a read
of any other board fails the render. The page publishes
`window.archboardReplay` with `load(talk)` and `frame(n)`.

### The frame clock

Everything that moves on the replay page reads one clock, the frame clock in
`src/ui/frame-clock`. A live page gets the browser's own clock:
`performance.now`, `requestAnimationFrame`, `setTimeout` and the SVG clock. The
replay page installs a stepped clock once, at page start. The viewer's camera
glide and picture transitions, and the subtitles' linger, read the time and
schedule their work through it. A lint rule over the viewer, the subtitles and
the replay keeps new code on the clock. Lint owns this rule, not a test.

Frame `n` is at `n * 1000 / 30` ms, which is exactly 1600 samples of the voice.
To draw frame `n`, the replay page:

1. Takes the events that fall on this frame, the first frame at or after each
   event's time.
2. Moves the clock to the frame's time, which runs each timer at its own due
   time.
3. Applies the events: the step, and the transcript's lines.
4. Waits until the page is ready.
5. Runs the frame callbacks of the glides and flights with the frame's time.
6. Waits until the page settles again.
7. Pauses every Web Animation, CSS transition, CSS animation and SMIL root and
   seeks it to the frame's time. An animation that has run past its end
   finishes once, so its `finish` listeners run.
8. Waits for one real animation frame, so the browser paints.

Four conditions make the page ready:

- The fonts are loaded.
- No query is fetching.
- The published picture shows the talk's board, at the talk's version and the
  last step applied.
- The DOM did not change for two macrotasks.

The clock stays still while the page waits, and the wait is bounded by
`RECORDING_FRAME_READY_MS`. A timeout names what was still pending.

The stepped clock guards itself, and a violation fails the render with the
frame number:

- A call to the global `requestAnimationFrame` after the clock is installed.
- An animation on another timeline, or one that is still running after the
  seek.
- An SVG root whose animations are not paused.
- A board read that the talk does not answer.

The guard cannot see a timer that changes the picture on real time. So two
renders of one talk give byte-identical frames, and a test holds them to
that.

### Why the clock lives in the page

We rejected Chromium's virtual time and `HeadlessExperimental.beginFrame`.

- `beginFrame` needs a target made with BeginFrameControl and
  `--run-all-compositor-stages-before-draw`. That is the rendering path of
  chrome-headless-shell. Archboard runs the full Chromium with
  `--headless=new`. So `beginFrame` means shipping a second browser.
- `Emulation.setVirtualTimePolicy` is experimental. It makes timers virtual,
  but without `beginFrame` it cannot draw the frame for a given time. It also
  runs only inside a real browser, so no module test can hold it.
- Remotion uses no virtual time at production scale. It seeks each frame, then
  takes a screenshot.
- A clock in the page works on every Chromium build, and module tests hold its
  pure parts.

### Each frame is captured as JPEG

The renderer captures each frame with `Page.captureScreenshot` as JPEG at
quality 92, with `optimizeForSpeed` and `fromSurface`.

- The picture is encoded again as 4:2:0 H.264, so a lossless frame buys
  nothing.
- Chromium encodes a 2 MP PNG several times slower than a JPEG, and a PNG
  frame is 3 to 5 times more bytes to send over DevTools.
- At quality 92, JPEG artifacts stay below those of x264 at CRF 18 on thin
  lines and text.

The rasterizer keeps PNG, because its PNG is the product.

### ffmpeg makes the file

The picture is encoded outside the browser, by ffmpeg. The recorder finds
ffmpeg in this order:

1. `ARCHBOARD_FFMPEG`. When it names a program that does not run, the recorder
   refuses by that name. It never falls back to another ffmpeg without saying
   so.
2. `ffmpeg` on `PATH`.
3. Nix. If `nix` is on `PATH`, the recorder runs
   `nix --extra-experimental-features "nix-command flakes" run nixpkgs#ffmpeg-headless --`.
4. Otherwise the recorder refuses with `ENCODER_UNAVAILABLE` (exit 4). The
   error names both ways to get one: put ffmpeg on `PATH` or name it with
   `ARCHBOARD_FFMPEG`, or install Nix.

Before any browser starts, the recorder runs `ffmpeg -encoders`. An MP4 needs
`libx264` and `aac`, and a WebM needs `libvpx-vp9` and `libopus`. A missing
encoder is refused by its name. The probe is bounded by
`RECORDING_ENCODER_PROBE_MS`. The first run through Nix fetches the package.
So `RECORDING_NIX_FETCH_MS` bounds that run, and the recorder first says that
it is fetching ffmpeg through Nix.

- `nix run` starts the package's own program, `ffmpeg`, in its own place. So
  the frame pipe on standard input and every signal reach ffmpeg itself.
- `ffmpeg-headless` has libx264, libvpx, Opus and the native AAC encoder, with
  fewer dependencies than the full package.
- `nixpkgs` comes from the machine's registry, not from a pinned revision. The
  user chose this.

One ffmpeg runs per render. The JPEG frames go in on standard input
(`image2pipe`), and the next frame waits until the pipe has taken the last
one. `voice.wav` is the second input. The frames are converted from full-range
BT.601 to BT.709 limited range, not only tagged as such. The sound is padded
to exactly the frames' length. Frame `n` is at `n / 30` s and sample `s` is at
`s / 48000` s, so the picture and the voice line up by construction. One
ffmpeg run muxes both, so the file's edit list covers the AAC priming.

- An MP4 is H.264 (libx264, preset medium, CRF 18, profile high) with AAC at
  160 kb/s, its index at the front.
- A WebM is VP9 (libvpx-vp9, CRF 30) with Opus at 128 kb/s. The user chose to
  keep both containers.

The sound conversion from Opus to AAC goes away. Pass 2 encodes AAC from the
voice's samples, so every MP4 plays with sound in every browser.

### The commands

`archboard semantic record` runs the passes in this order:

1. It finds ffmpeg and probes its encoders.
2. It runs pass 1.
3. It writes the talk.
4. It runs pass 2.
5. After ffmpeg exits and the browser stops, it moves the file into place.
6. It discards the board, with `--discard`.

A failure in pass 2 keeps the board and the talk. Two refusals are new:
`ENCODER_UNAVAILABLE` (exit 4) and `RENDER_FAILED` (exit 1, which names the
kept talk). The receipt gains `talk` and `frames`. `--theme` is pass 2's input,
and the talk records it.

`archboard semantic replay <talk> --out <file> [--theme light|dark]` renders a
kept talk again. It is a command of its own, because the command contract has
no exclusions between local options. An option of `record` needs `--variant`,
`--walkthrough`, `--language` and `--discard` excluded. The contract cannot
state those exclusions, so only the description says them. Replay needs the Archboard server only for the page. The board need not
exist, and no Codex or voice is involved. A talk that cannot be read, or one
from another format version, is refused before a browser starts.

### What pass 1 no longer does

Pass 1 captures no picture, so these go:

- The tab capture (`getDisplayMedia` and `MediaRecorder`), the subtitle box
  drawn before capture, and the repaint layer behind the pane.
- `--enable-gpu`, `--disable-gpu-rasterization` and
  `--auto-accept-this-tab-capture`. Pass 1 needs no GPU, because nobody looks
  at its page. Pass 2 draws in software with `--disable-gpu`, like the
  rasterizer.
- The sound conversion and its Safari note, `RECORDING_CAPTURE_BAR_MS` and
  `RECORDING_SOUND_CONVERT_MS`.

This reverses ADR 0035's "The page records itself", its "Not Remotion" and its
rule that the picture is never encoded outside the browser. It reverses "ffmpeg
stays optional" and both TASK-378 amendments.

### Rendering pages in parallel is deferred

A step does not begin at rest. Subtitles linger for 2.5 s across a step, the
SMIL traffic runs from the picture's insertion, and fades cross step
boundaries. So each page after the first has to replay every event up to its
range first. Parallel pages also need a frame multiplexer, a layout worker
pool for each page, and a test that holds them equal to one page. We render on
one page. If the measured render takes more than about twice the talk,
parallel rendering becomes a follow-up task.

## Consequences

- Every frame of a recording is drawn at its own time, with or without a GPU
  and under load.
- The voice, each step and each subtitle line meet the picture within one
  frame.
- A kept talk renders again without a voice session. A renderer fix reaches old
  talks.
- A recording takes longer. Pass 2 runs after the talk. The first estimate is
  25 to 90 ms per frame, so a talk of 100 s renders in about 1.5 to 3.5
  minutes. This is not measured yet. TASK-381 measures it and records the
  number.
- A recording needs ffmpeg or Nix. Without either, it is refused before it
  starts, and the error says how to get one.
- A first run through Nix without a network fails with the tail of Nix's
  error.
- `talk.json` repeats each line's text in every `said` event, so a talk is a
  few MB.
- Only the board's version is checked during pass 1. A change to the vault
  policy during pass 1 goes unnoticed.
- The replay page and the recording page's pane must build the same DOM. The
  replay reuses the recording stage so that they do.
- `--theme` no longer changes what the voice sees in pass 1.

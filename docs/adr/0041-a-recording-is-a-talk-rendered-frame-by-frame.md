---
status: accepted
---

# A recording is a talk rendered frame by frame

This ADR supersedes
[ADR 0035](0035-a-recording-is-paced-and-captured-by-the-page.md) in full. The
user decided on the two passes on 2026-09-30, after comparing Archboard's
recorder with Remotion's capture pipeline. The user also decided that the
encoder is ffmpeg. TASK-381 built it.

## Context

ADR 0035 made a recording in one live pass. The page paced the walkthrough on
the Codex voice and captured its own tab with `getDisplayMedia` and
`MediaRecorder`. So every frame depended on Chromium's tab capture and its
compositor. TASK-378 needed a repaint layer, GPU compositing and a shader
warm-up to keep held frames under 50 ms. A machine without a usable GPU still
held the picture for 57 to 75 ms in the glides between views. A busy machine
held it longer.

The voice paces a walkthrough, so the pacing needs a live pass. The picture
does not. It needs every frame drawn at its own time.

## Decision

A recording is made in two passes.

1. **Pass 1 records the talk.** The live page paces the walkthrough on the
   voice, as before, and captures no picture. It keeps the voice's sound and
   stamps each step, subtitle line and drawn board version on the clock of that
   sound.
2. **Pass 2 renders the picture.** The CLI opens a replay page in a second
   headless Chromium. The page draws the talk's board from the talk alone, on a
   clock that it steps 1/30 s at a time. The CLI captures each frame and pipes
   it to ffmpeg with the voice. No Codex runs, and nothing is captured from a
   live screen.

So every frame is drawn, with or without a GPU and under any load. A kept talk
renders again, in the other theme or after a renderer fix, with no new voice
session.

### What stands from ADR 0035

- **The page moves on by itself.** Two conditions end a step. First,
  every line that the voice said about it is final in the transcript. Second,
  the voice's output stays below speaking level for `RECORDING_QUIET_MS`. Only
  the page hears the audio, so the page decides, not the server. The pane
  reports the step as its own, with `answering: null`. Four things fail the
  recording. A step never arrives. The voice says nothing about a step. The
  voice talks about one step for minutes. The voice stops.
- **A recording start differs from a narration start in four ways.** The voice
  model gets the voice's persona and a recording section, and none of the
  conversation rules. The coordinator writes only quiet commentary. The
  Realtime API's delegation filler is off. The server opens no step itself.
- **Pass 1 runs on the Archboard server that the CLI talks to**, because that
  server holds the Codex sign-in. The recording page is a tab session of its
  own (TASK-373). Its pane registers as a recording's pane. The server leaves
  that pane out of every feature that picks a pane for somebody who did not
  name one. The recording page always shows subtitles. Its browser plays audio
  without a gesture and has a fake microphone, granted over DevTools, that
  plays silence.
- **`--discard` deletes a board made to be recorded**, once the file is
  written, under the board's lease and at the version that the command read. A
  failed recording keeps the board, and so does a board that changed meanwhile.
- **A recording speaks one language** (TASK-380). `--language` takes a BCP 47
  tag, English by default. `RecordingLanguageSchema` refuses a tag that names no
  language before anything starts.

### The talk

A talk is a directory of `talk.json` and `voice.wav`. `TalkSchema` in
`src/shared/walkthrough-recording/talk.ts` is its one contract, and both the
CLI and the replay page read it. `talk.json` holds these things:

- The format, its version, the time of the recording, the language and the
  theme.
- The board: its name, variant, version, walkthrough and number of steps.
- The audio: 48 kHz, one channel, and the number of samples.
- The board's document, and the vault policy that it was drawn under.
- The events.

Each event is stamped `at` a count of samples from the start:

- `step`: a step of the walkthrough was shown.
- `said`: one of the voice's lines changed. The event holds its whole text so
  far.
- `drawn`: the pane drew the board at a version.
- `end`: the talk ended.

The schema refuses a talk that cannot be rendered:

- Its steps are not shown once each and in order.
- Its events are not in time order.
- Its last event is not its one `end`, at the length of its voice.
- Its board document, or a `drawn` event, is at another version than the talk
  states.

A `drawn` event at another version means that the board changed while it was
recorded. Pass 1 then fails with `RECORDING_FAILED` and says to record again.
Reading a talk also refuses a `voice.wav` whose length differs from the talk's.

`semantic record` writes the talk whole, through a staging directory and a
rename, before pass 2 starts. The talk goes to `recordings/<UTC stamp>-<board>/`
in the state directory, where the newest 10 talks stay. `--talk <dir>` puts it
in that directory instead, which must not exist and is never pruned. If pass 2
fails, the talk stays, and the refusal names the `semantic replay` command that
renders it.

### Pass 1

`src/ui/walkthrough-recording/lib/talk-capture.ts` makes one `AudioContext` at
48 kHz. The voice's stream goes through a mix bus into an AudioWorklet tap, and
from the tap into a gain of zero. So the graph pulls the tap while nobody hears
it. The tap passes on each render quantum with the frame it began at. It passes
on silence too. So the voice's samples and the graph's clock are one count. The
tap is one function, sent to the worklet as source text from a Blob URL. So it
uses nothing from its module. The voice's audio element stays muted, and a
muted element still hands a WebRTC track's sound to Web Audio.

Each event is stamped with the graph's clock, from the moment that the voice
goes live. The `said` events follow the pane transport's transcript by
subscription, not by the pacing tick, so each change keeps its own moment. The
talk stamps the voice's lines of that transcript directly. The plan moved
`subtitledTranscript` into `src/ui/voice-subtitles`. It stayed in
`src/ui/application`, because the talk does not use it. At the end, the page
waits up to `RECORDING_TAP_DRAIN_MS` for the last quanta and cuts the sound to
the talk's exact length. It hands over the voice as a 16-bit mono WAV and the
event log.

### The replay page

The server serves `/?replay=1` from the same static files. For that address the
entry point mounts `src/ui/walkthrough-replay` in place of the application, with
no workbench, no pane session and no socket. The page mounts the recording
stage, the board stage and the subtitles, as the recording page does. It reads
the board and the vault policy only from the talk, through the board-reads port
(`readBoardsFrom`). It publishes `window.archboardReplay` with `load(talk,
options)` and `frame(n)`.

`load` plays the board's entrance through `RECORDING_REPLAY_PREROLL_MS` of
frames that nobody captures, so frame 0 shows the board at rest. Frame `n` is at
`n / 30` s, which is exactly 1600 samples of the voice. An event shows on the
first frame at or after it. To draw frame `n`, the page does these things:

1. It moves the stepped clock to the frame's time, and each timer runs at its
   own due time on the way.
2. It applies the events that are due.
3. It waits until the page is ready.
4. It runs the frames that were asked for, and waits again.
5. It stands every Web Animation and SVG clock at the frame's time.
6. It waits for one real paint.

Four conditions make the page ready:

- The fonts are loaded.
- No query fetches.
- The pane shows the talk's board at the talk's version and step.
- The DOM did not change for two turns of the event loop.

`RECORDING_FRAME_READY_MS` bounds the wait, and the refusal names what the page
waited for.

### The frame clock

Everything that moves on a board's pane reads one clock, `frameClock()` from
`src/ui/frame-clock`: the camera glide, the picture's transitions, the SVG
traffic, the subtitles' linger and the subject tip's delay. A live page gets the
browser's clock. The replay page installs a stepped clock once, before anything
mounts. Lint keeps `src/ui/semantic-board-canvas` and `src/ui/voice-subtitles`
off the browser's timers.

The draft refused every call to the browser's own `requestAnimationFrame` once
the stepped clock was installed. The build runs those calls instead:
`install()` routes `window.requestAnimationFrame` and `cancelAnimationFrame` to
the stepped clock. When a component mounts, Base UI's transition status asks the
browser for frames. Such a frame now runs on the stepped clock at its time.
Two guards remain, and each fails the render with the frame's number: an
animation on another timeline, and a read of a board other than the talk's.

### The render

`renderTalk` in `src/runtime/walkthrough-recorder/lib/render.ts` starts Chromium
in software, with `--disable-gpu` and `--disable-partial-raster`. A partial
raster reuses a tile's old content, so a frame's pixels depended on how many
real frames Chromium drew while the page waited. Without the flag, two renders
of one talk differed in 2 to 22 of 240 frames by a few pixels. With it, three
renders of three were byte-identical (2026-09-30, the web-shop example,
Chromium 153).

After each `frame(n)`, the CLI captures the frame with `Page.captureScreenshot`
as a JPEG at quality 92 and writes it to ffmpeg. The next frame waits until
ffmpeg has taken it. Chromium also runs with `--disable-frame-rate-limit` and
`--disable-gpu-vsync`. Without them, a screenshot waits for the display's next
frames: 79 ms a frame with the limit, 36 ms without it (TASK-382).

A screenshot costs several times what drawing a frame costs, so a long talk
is drawn by several pages at once, each in a Chromium of its own (TASK-382).
Every page draws every frame, because a frame depends on the frames before it.
Each page captures only its own seconds: page k takes seconds k, k + n,
k + 2n and so on, for n pages. A frame that is drawn and not captured costs
about 9 ms. `FrameOrder` in `lib/frame-order.ts` hands the frames to the one
ffmpeg in order and holds a frame that arrives early. A page runs at most two
rounds of seconds ahead of the encoder, which bounds what is held. The number
of pages is a quarter of the machine's threads, at most six, and one page for
every 300 frames of the talk. A frame is the same whichever page draws it: the
split render of the talk below decodes to the same picture as the render on
one page. A JPEG is enough, because the picture is encoded again as
4:2:0 H.264. `RECORDING_FRAME_CALL_MS` bounds each call into the page. The file
is renamed into place after ffmpeg exits with 0. A failure while it renders is
`RENDER_FAILED` (exit 1). It writes no file and keeps the talk.

We rejected Chromium's virtual time and `HeadlessExperimental.beginFrame`.
`beginFrame` needs chrome-headless-shell, and Archboard runs the full Chromium
with `--headless=new`. Virtual time without `beginFrame` does not draw the frame
for a given time. A clock in the page works on every Chromium build, and module
tests hold it.

### ffmpeg

The recorder finds ffmpeg in this order:

1. The one that `ARCHBOARD_FFMPEG` names. The recorder never passes over it. If
   it does not run, the refusal names it.
2. `ffmpeg` on `PATH`.
3. `nix --extra-experimental-features "nix-command flakes" run nixpkgs#ffmpeg-headless --`,
   when `nix` is on `PATH`. `nixpkgs` comes from the machine's registry, which
   the user chose.
4. None of these: the command refuses with `ENCODER_UNAVAILABLE` (exit 4) and
   names both ways to get one.

Before any browser starts, the recorder runs `ffmpeg -encoders`. An MP4 needs
`libx264` and `aac`, and a WebM needs `libvpx-vp9` and `libopus`.
`RECORDING_ENCODER_PROBE_MS` bounds the probe. Through Nix,
`RECORDING_NIX_FETCH_MS` bounds it, because the first run fetches the package,
and the recorder first says that it fetches ffmpeg.

One ffmpeg runs per render. The JPEG frames arrive on standard input
(`image2pipe`), and `voice.wav` is the second input. The picture is converted
from Chrome's full-range BT.601 to limited-range BT.709. `setparams` then tags
the frames BT.709, because ffmpeg 9 takes the stream's primaries and transfer
from its frames, and the conversion leaves them unset. The sound is padded to
exactly the frames' length, so the picture and the voice line up by
construction.

- An MP4 is H.264 High (libx264, preset medium, CRF 18) with AAC at 160 kb/s,
  and its index is at the front.
- A WebM is VP9 (CRF 30) with Opus at 128 kb/s.

### The commands

`archboard semantic record` does these things in order:

1. It finds ffmpeg and probes it.
2. It runs pass 1 and writes the talk.
3. It runs pass 2 and moves the file into place.
4. With `--discard`, it discards the board.

Its receipt gains `frames` and `talk`. It refuses with `ENCODER_UNAVAILABLE`
and `RENDER_FAILED` as well. `--theme` is pass 2's input, and the talk keeps it.

`archboard semantic replay <talk> --out <file> [--theme light|dark]` renders a
kept talk again. It needs the Archboard server only for the page. The board need
not exist, and no Codex or voice runs. A talk that cannot be read, or one of
another format version, is a usage error (exit 2) before a browser starts.
Replay is a command of its own. The command contract cannot state exclusions
between a command's own options, and an option of `record` needs four of them:
`--variant`, `--walkthrough`, `--language` and `--discard`.

### What went away

Pass 1 captures no picture, so these went:

- The tab capture: `getDisplayMedia`, `MediaRecorder` and
  `--auto-accept-this-tab-capture`.
- The rehearsal and the frame pacer, with its repaint layer.
- The GPU flags `--enable-gpu` and `--disable-gpu-rasterization`.
- `keepSize` and `HeadlessChromium.fitWindow`, which sized the window again
  after the capture bar took room.
- The Opus-to-AAC conversion and its Safari note. Every MP4 now has AAC sound.
- `RECORDING_CAPTURE_BAR_MS` and `RECORDING_SOUND_CONVERT_MS`.

This reverses these parts of ADR 0035: "The page records itself", "Not
Remotion", the rule that the picture is never encoded outside the browser,
"ffmpeg stays optional" and both TASK-378 amendments.

## Consequences

- Every frame is drawn at its own time, with or without a GPU and under load. A
  real recording on 2026-09-30 measured it: the web-shop walkthrough "How an
  order is placed today", 4 steps in English, ffmpeg-headless 9.0.1 through Nix,
  no GPU in pass 2. The talk of 85.3 s rendered to 2560 frames. Every frame was
  33.333 or 33.334 ms after the one before. The picture was H.264 High, yuv420p,
  1920x1080, in limited range. The sound was AAC LC, 48 kHz and mono, as long as
  the picture, and matched `voice.wav` at 0 samples of lag. That first render
  lacked the primaries and transfer tags. After the `setparams` fix, a render
  of the same talk read BT.709 for all three.
- The voice, the steps and the subtitles meet the picture within one frame. In
  that recording, each of the 4 steps first changed the picture on frame
  `ceil(at / 1600)`. The first words of two lines first changed the subtitles on
  frame `ceil(at / 1600)` too.
- A render takes less time than its talk. On one page, a render of that talk
  took 211 s, about 83 ms a frame, or 2.5 times the talk, which was more than
  the draft's bound of about twice the talk. TASK-382 lifted the frame-rate
  limit and split the render across pages. On a machine with 24 threads, six
  pages rendered the same talk in 49 s, 0.57 times the talk, and the video
  decodes to the same picture as the render on one page.
- A recording needs ffmpeg or Nix. Without either, it is refused before it
  starts, and the refusal says how to get one. A first run through Nix without
  a network fails with the tail of Nix's error.
- A talk is mostly its voice, about 96 kB a second. The talk above was 8.3 MB.
  The state directory keeps the newest 10.
- Only the board's version is checked during pass 1. A change to the vault
  policy during pass 1 goes unnoticed.
- The replay page and the recording page must build the same DOM. The replay
  mounts the recording's own `RecordingStage` so that they do.

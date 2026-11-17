---
status: accepted
---

# A recording is a talk rendered frame by frame

This ADR supersedes
[ADR 0035](0035-a-recording-is-paced-and-captured-by-the-page.md) in full. The
user decided on the two passes on 2026-09-30, after comparing Archboard's
recorder with Remotion's capture pipeline. The user also decided that the
encoder is ffmpeg. TASK-381 built it.

Amended by TASK-469 (2026-10-12): `semantic record` and `semantic replay` take
`--layout track|blocks`. Like `--theme`, the layout is pass 2's input, and the
talk keeps it. `talk.json` gains `layout`. A talk without it was drawn with
Track and reads as Track, so the format version stays 1. An older archboard
refuses a talk that states a layout, because the talk's schema is strict.

Amended by TASK-478.01 (2026-10-15): `semantic record` takes `--against <variant>`,
and every frame is drawn relative to that variant, without the Planned frame
([ADR 0031](0031-existence-is-a-fact-about-a-variant-never-about-a-node.md)).
`talk.json` gains `board.against`, the variant's id. A talk without it reads
against the variant the board ordinarily reads it against, so the format version
stays 1. An older archboard refuses a talk that states it, because the talk's
schema is strict.

## Context

ADR 0035 made a recording in one live pass. The page paced the walkthrough on
the Codex voice and captured its own tab with `getDisplayMedia` and
`MediaRecorder`. So every frame depended on Chromium's tab capture and its
compositor. TASK-378 needed a repaint layer, GPU compositing and a shader
warm-up to keep held frames under 50 ms. A machine without a usable GPU still
held the picture for 57 to 75 ms in the glides between views. A busy machine
held it longer.

The voice paces a walkthrough, so the pacing needs a live pass. The picture does
not need a live pass. It needs every frame drawn at its own time.

## Decision

A recording takes two passes.

1. Pass 1 records the talk. The live page paces the walkthrough on the voice, as
   before, and captures no picture. It keeps the voice's sound. It stamps each
   step, subtitle line and drawn board version on the clock of that sound.
2. Pass 2 renders the picture. The CLI opens a replay page in a second headless
   Chromium. The page draws the talk's board from the talk alone, on a clock
   that it steps 1/30 s at a time. The CLI captures each frame and pipes it to
   ffmpeg with the voice. No Codex runs, and nothing is captured from a live
   screen.

So every frame is drawn, with or without a GPU and under any load. A kept talk
renders again, in the other theme or after a renderer fix, with no new voice
session.

### What stands from ADR 0035

- The page moves on by itself. Only the page hears the audio, so the page
  decides when a step ends, not the server.
- Pass 1 runs on the Archboard server that the CLI talks to, because that server
  holds the Codex sign-in. The recording page is a tab session of its own
  (TASK-373). Its pane registers as a recording's pane. The server leaves that
  pane out of every feature that picks a pane for somebody who did not name one.

### The talk

A talk is a directory of `talk.json` and `voice.wav`. `TalkSchema` in
`packages/walkthrough/src/shared/protocol/talk.ts` is its one contract, and both the CLI
and the replay page read it. The schema refuses a talk that cannot be rendered.

`semantic record` writes the talk whole, through a staging directory and a
rename, before pass 2 starts. If pass 2 fails, the talk stays, and the refusal
names the `semantic replay` command that renders it.

### The replay page

The server serves `/?replay=1` from the same static files. For that address the
entry point mounts `src/ui/walkthrough-replay` in place of the application, with
no workbench, no pane session and no socket. The page reads the board and
the vault policy only from the talk, through the board-reads port
(`readBoardsFrom`).

### The frame clock

Everything that moves on a board's pane reads one clock, `frameClock()` from
`@archboard/ui-kit/frame-clock`. A live page gets the browser's clock. The
replay page installs a stepped clock once, before anything mounts. Lint keeps
`src/ui/semantic-board-canvas` and `src/ui/voice-subtitles` off the browser's
timers. `install()` routes `window.requestAnimationFrame` and
`cancelAnimationFrame` to the stepped clock.

### The render

`renderTalk` in `packages/walkthrough/src/runtime/operations/render-talk.ts` starts Chromium
in software, with `--disable-gpu` and `--disable-partial-raster`. A partial
raster reuses a tile's old content, so a frame's pixels depended on how many
real frames Chromium drew while the page waited. Without the flag, two renders
of one talk differed in 2 to 22 of 240 frames by a few pixels. With it, three
renders of three were byte-identical (2026-09-30, the web-shop example, Chromium
153).

On 2026-10-01 the user kept software rendering after a measurement against GPU
compositing (`--enable-gpu --disable-gpu-rasterization`, the flags TASK-378 used
for tab capture). The talk had 1800 frames and rendered on six pages, on a
machine with an RTX 4090 that Chromium really used:

- Both flag sets were equally stable. In each set, 6 of 8 renders were
  byte-identical, and the other 2 each had one stray frame. So software renders
  are not always byte-identical either.
- GPU frames differ from software frames: 612 of 1800 frames, the same ones in
  every pair. Most differ by 2 to 5 levels inside the blurred box behind the
  subtitles. In one camera glide, text moves by 1 to 2 px.
- The GPU is not faster within the noise: 19.4 to 19.8 ms a frame in software,
  18.2 to 19.9 ms with the GPU.
- With the GPU hidden, the GPU flags fall back to software and match it.

So the GPU buys no measurable speed, and a render made with a GPU differs from
one made without. Software gives every machine the same picture of a talk.

A screenshot costs several times what drawing a frame costs. So several pages
draw a long talk at once, each in a Chromium of its own (TASK-382). Every page
draws every frame, because a frame depends on the frames before it. Each page
captures only its own seconds: page k takes seconds k, k + n, k + 2n and so on,
for n pages.

A failure while it renders is `RENDER_FAILED` (exit 1). Such a failure writes no
file and keeps the talk.

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
3. If `nix` is on `PATH`, the recorder runs
   `nix --extra-experimental-features "nix-command flakes" run nixpkgs#ffmpeg-headless --`.
   `nixpkgs` comes from the machine's registry, which the user chose.
4. If none of these exists, the command refuses with `ENCODER_UNAVAILABLE`
   (exit 4) and names both ways to get one.

### The commands

`archboard semantic replay` renders a kept talk again. It needs the Archboard
server only for the page. The board does not need to exist, and no Codex or
voice runs. A talk that cannot be read, or one of another format version, is a
usage error (exit 2) before a browser starts. Replay is a command of its own.
The command contract cannot state exclusions between a command's own options. An
option of `record` needs four of them: `--variant`, `--walkthrough`,
`--language` and `--discard`.

### What went away

This reverses these parts of ADR 0035:

- "The page records itself".
- "Not Remotion".
- The rule that the picture is never encoded outside the browser.
- "ffmpeg stays optional".
- Both TASK-378 amendments.

## Consequences

- A recording needs ffmpeg or Nix. Without either, the command refuses the
  recording before it starts, and the refusal says how to get one.
- Pass 1 makes sure only that the board's version did not change. A change to
  the vault policy during pass 1 goes unnoticed.
- The replay page and the recording page must lay out the same frame. The
  replay mounts the recording's own `RecordingStage` so that the pane and its
  walkthrough's column stand where they stood.

## Canonical walkthrough recordings

TASK-549.14 extends the existing talk with an optional `architecture` payload.
It contains one complete canonical reading and its resolved playback.
Canonical talks require an exact retained checkpoint and available beats.
Their `document` is null because the architecture payload owns the captured meaning.
Legacy talks keep their original document and remain readable.

The recorder never resolves the architecture from a chosen mutable checkout.
Canonical drawn events report the captured revision digest.
The talk reader refuses a different revision before replay starts.

Replay loads the stored payload and uses the existing frame clock.
It reads no current vault and starts no voice model.
The artifact supplies every architecture read, including after the source repository disappears.

Replay disables Chromium animation execution on the compositor thread.
The first frame of a new SVG otherwise varied even when its markup and sampled animation times matched.

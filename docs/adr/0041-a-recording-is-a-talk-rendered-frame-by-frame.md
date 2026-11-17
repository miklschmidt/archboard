---
status: accepted
---

# A recording is a talk rendered frame by frame

This ADR replaces the earlier one-pass recording in full. The encoder is ffmpeg.

## Context

The earlier design made a recording in one live pass. The page paced the walkthrough on
the Codex voice and captured its own tab with `getDisplayMedia` and
`MediaRecorder`. A machine without a usable GPU held the picture for 57 to
75 ms in the glides between views, and a busy machine held it longer.

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

Two things stand from the one-pass design. Only the page hears the audio, so the page
decides when a step ends, not the server. Pass 1 runs on the Archboard server
that the CLI talks to, because that server holds the Codex sign-in.

### The talk

A talk is a directory of `talk.json` and `voice.wav`. `TalkSchema` is its one
contract, and both the CLI and the replay page read it. The schema is strict. A
field added later has a default reading, so the format version stays 1. An
older archboard refuses a talk that states such a field.

A canonical talk carries one complete canonical reading from an exact retained
checkpoint. The recorder never resolves the architecture from a chosen mutable
checkout, and replay reads no current vault.

### The frame clock

Everything that moves on a board's pane reads one clock, `frameClock()` from
`@archboard/ui-kit/frame-clock`. A live page gets the browser's clock. The
replay page installs a stepped clock once, before anything mounts. Lint keeps
the board and subtitle code off the browser's timers.

We rejected Chromium's virtual time and `HeadlessExperimental.beginFrame`.
`beginFrame` needs chrome-headless-shell, and Archboard runs the full Chromium
with `--headless=new`. Virtual time without `beginFrame` does not draw the frame
for a given time. A clock in the page works on every Chromium build.

### The render

Pass 2 starts Chromium in software, with `--disable-gpu` and
`--disable-partial-raster`. A partial raster reuses a tile's old content, so a
frame's pixels depended on how many real frames Chromium drew while the page
waited. Replay also disables Chromium animation execution on the compositor
thread. The first frame of a new SVG otherwise varied even when its markup and
sampled animation times matched.

The user kept software rendering after a measurement against GPU compositing.
The GPU bought no measurable speed, and a render made with a GPU differed from
one made without. Software gives every machine the same picture of a talk.

Several pages draw a long talk at once, each in a Chromium of its own. Every
page draws every frame, because a frame depends on the frames before it.

### The commands

`archboard semantic replay` renders a kept talk again, with no Codex or voice.
Replay is a command of its own. The command contract cannot state exclusions
between a command's own options, and an option of `record` needs four of them.

## Consequences

- Pass 1 makes sure only that the board's version did not change. A change to
  the vault policy during pass 1 goes unnoticed.
- The replay page and the recording page must lay out the same frame. The
  replay mounts the recording's own `RecordingStage` so that the pane and its
  walkthrough's column stand where they stood.

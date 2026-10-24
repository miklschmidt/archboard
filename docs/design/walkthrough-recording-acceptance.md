# Recorded walkthrough: real-voice acceptance (TASK-304, TASK-305, TASK-381)

A person runs this on an Archboard server whose Codex is signed in. It proves
what the automated owners cannot. With nobody listening, a real voice model
explains each step that it is handed. It falls silent afterwards, so the
recording moves on, and it ends with the last step. The real video has one frame
every 1/30 s, and its words and steps are on the frames where they happened. The
mechanism is in
[ADR 0041](../adr/0041-a-recording-is-a-talk-rendered-frame-by-frame.md).

`ffprobe` comes with `ffmpeg`. If neither is on `PATH`, run each `ffprobe` and
`ffmpeg` command below through Nix:
`nix --extra-experimental-features "nix-command flakes" shell nixpkgs#ffmpeg-headless -c <command>`.

## 1. Record this checkout's own board

Voice can stay live in another browser tab. The recording page is a tab of its
own, with its own conversation and voice session (TASK-373).

```bash
bun run build
archboard stop; archboard start
archboard semantic record Archboard --walkthrough "Read this board" --out /tmp/archboard.mp4 > /tmp/archboard.json
```

The command prints these lines on stderr:

1. If `PATH` has no `ffmpeg`, `Fetching ffmpeg through nix.` comes first.
2. `Recording: voice is starting.`, then one line for each step.
3. `Kept the talk in <dir>.`
4. `Rendered <n> of <frames> frames.` for each second of video. On a machine
   with several cores, rendering takes less time than the talk (TASK-382).

The receipt in `/tmp/archboard.json` gives the file, its size, its duration,
the steps, the frames and the talk's directory.

## 2. Watch it

Open the file in a browser.

| #   | Observe                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------ |
| a   | The video is 1920x1080: the board and the shell's voice box, orb included. No navigator, pane header, agent dock or sidebar.   |
| b   | It opens on the whole board, then glides into step 1 while the voice begins explaining it.                                     |
| c   | The voice explains each step in English, in its own words, with names and no ids, and never says a step's number.              |
| d   | After each explanation there is a short pause, then the next step glides in. No step starts while the voice is still speaking. |
| e   | The voice never asks a question, invites questions, or says it is waiting.                                                     |
| f   | After the last step the voice closes in one sentence, and the video ends a moment later on the last step.                      |
| g   | The picture never stops while something moves: no hitch as a glide ends, and none while subtitles or traffic go on.            |

## 3. Measure the frames, the codecs and the timing

Every frame comes 1/30 s after the one before. This command prints the frame
count and nothing else:

```bash
ffprobe -v error -select_streams v:0 -show_entries frame=pts_time -of csv=p=0 /tmp/archboard.mp4 \
  | awk 'NR > 1 && ($1 - last < 0.0333 || $1 - last > 0.0334) { print "frame " NR - 1 " is " $1 - last " s after the one before" } { last = $1 } END { print NR " frames" }'
```

The count is the receipt's `frames`.

```bash
ffprobe -v error -show_entries stream=codec_name,profile,pix_fmt,width,height,color_range,color_space,color_primaries,color_transfer,sample_rate,channels,duration -of default=nw=1 /tmp/archboard.mp4
```

The picture is `h264`, `High`, `yuv420p` and 1920x1080. Its `color_range` is
`tv`, and its `color_space`, `color_primaries` and `color_transfer` are all
`bt709`. The sound is `aac`, `LC`, 48000 Hz and one channel. Both streams have
the same duration.

Each step and the first word of each line show on a known frame: the first
frame at or after the moment in the talk. List them from the kept talk:

```bash
talk=$(jq -r .talk /tmp/archboard.json)
jq -r '.events[] | select(.kind == "step") | "step \(.beat + 1): frame \(.at / 1600 | ceil)"' "$talk/talk.json"
jq -r '[.events[] | select(.kind == "said" and .text != "")] | group_by(.itemId) | map(min_by(.at)) | sort_by(.at)[] | "\(.text): frame \(.at / 1600 | ceil)"' "$talk/talk.json"
```

For a few of them, take the listed frame `n` and the frame before it:

```bash
n=619   # a frame from the lists above
ffmpeg -v error -i /tmp/archboard.mp4 -vf "select='between(n,$((n - 1)),$n)'" -fps_mode passthrough /tmp/frame-%d.png
```

For a step, `/tmp/frame-1.png` shows the number of the step before in the
walkthrough box, such as `1` over `of 5`. `/tmp/frame-2.png` shows the step's
own number, such as `2` over `of 5`. For a first
word, `/tmp/frame-1.png` shows no subtitle or the line before, and
`/tmp/frame-2.png` is the first frame where the subtitle changes.

## 4. Render the kept talk again in the other theme

Rendering a talk starts no voice. The voice's Codex session files are in the
state directory, under `codex-workbench/codex-home/sessions/<y>/<m>/<d>/`.
Count today's files, render, and count again:

```bash
sessions=~/.local/state/archboard/codex-workbench/codex-home/sessions/$(date +%Y/%m/%d)
ls "$sessions" | wc -l
archboard semantic replay "$(jq -r .talk /tmp/archboard.json)" --theme dark --out /tmp/archboard-dark.mp4
ls "$sessions" | wc -l
```

On macOS the state directory is `~/Library/Application Support/archboard`.

| #   | Observe                                                                                             |
| --- | --------------------------------------------------------------------------------------------------- |
| a   | The command prints `Rendered` lines, and no `Recording` line.                                       |
| b   | The two counts of session files are the same.                                                       |
| c   | The receipt says `theme: "dark"` and the same `frames` and `durationMs` as the recording's receipt. |
| d   | The video shows the same talk in the dark palette, with the same voice at the same moments.         |

## 5. Record in another language

Record the same walkthrough again with `--language da`:

```bash
archboard semantic record Archboard --walkthrough "Read this board" --language da --out /tmp/archboard-da.mp4
```

The voice speaks only Danish from its first word to its last, although the
steps are written in English. A tag that names no language, such as
`--language english`, is refused before a browser starts. The language that the
voice spoke is also in the Codex rollout of the recording. Look at the newest
`sessions/<y>/<m>/<d>/*.jsonl` file under the `codex-home` of the state
directory. It holds each thing that the voice said as a `realtime_item` of type
`transcript_segment`, with the role `assistant` (TASK-380).

## 6. Discard a board made for the video, and render it again

```bash
archboard semantic new recording-check --input <a board with one walkthrough>.json --doing "checking a recording"
archboard semantic record recording-check --out /tmp/check.mp4 --talk /tmp/check-talk --discard --doing "recording the check"
archboard semantic show recording-check   # refused: the board is gone
archboard semantic replay /tmp/check-talk --out /tmp/check-again.mp4
```

Recording writes nothing to the vault. Only `--discard` removes the board that
it recorded, and only after the file is written. `git status .archboard/vault`
is clean again once the board is discarded. The talk in `/tmp/check-talk` holds
the board as it was recorded, so the replay renders it although the board is
gone.

## 7. Refuse without an encoder

```bash
ARCHBOARD_FFMPEG=/nonexistent/ffmpeg archboard semantic record Archboard --walkthrough "Read this board" --out /tmp/refused.mp4
echo $?
```

The command exits with 4, the exit of `ENCODER_UNAVAILABLE`. Its error names
`ARCHBOARD_FFMPEG` and says that it did not run. It does not fall back to
another ffmpeg, and it starts no browser and no voice. On a machine with neither
`ffmpeg` nor Nix, the error names both ways to get one.

With no `ffmpeg` on `PATH` and Nix installed, the recorder runs
`nixpkgs#ffmpeg-headless` through Nix. Each such recording prints
`Fetching ffmpeg through nix.` first and then records as in section 1. The first
one also fetches the package, which can take minutes.

## 8. Record a pull request for its reviewers

Follow the archboard skill's
[pull request's recording](../../skills/archboard/references/sequences-views-walkthroughs.md#a-pull-requests-recording)
for a real pull request, and attach the file to it.

| #   | Observe                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------- |
| a   | What the pull request added and changed is marked on screen, and a removed part is drawn as removed.     |
| b   | The video plays with sound in the pull request's page in Chromium, Firefox and Safari.                   |
| c   | Somebody who has not read the diff can say what the pull request changed and why after watching it once. |

## Automated owners

- `tests/system/server-state/walkthrough-recording.test.ts` records end to end
  against a fake Codex and a fake ffmpeg. It checks the kept talk, the frames,
  the order in which the steps reached the voice, and `--discard`.
- `tests/system/server-state/walkthrough-replay.test.ts` renders a talk of a
  discarded board through the real replay page three times. The frames are the
  same each time. They move at a step and are still after it. The dark theme
  differs from the first frame.
- `tests/system/server-state/walkthrough-render.test.ts` fails a render against
  a stand-in page. The refusal is `RENDER_FAILED`, the talk is kept, and no file
  is written.
- `tests/system/server-state/walkthrough-recording-refusals.test.ts` owns the
  refusals that start no browser and no voice, `ENCODER_UNAVAILABLE` included.

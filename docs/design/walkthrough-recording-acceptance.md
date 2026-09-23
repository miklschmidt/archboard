# Recorded walkthrough: real-voice acceptance (TASK-304)

A person runs this on a canvas whose Codex is signed in. It proves what the
deterministic owners cannot: that a real voice model explains each step it is
handed when nobody is listening, falls silent afterwards so the recording
moves on, and ends with the last step. The mechanism is in
[ADR 0035](../adr/0035-a-recording-is-paced-and-captured-by-the-page.md).

## 1. Record this checkout's own board

Stop voice in any browser on the canvas first: a recording refuses to start
while voice is live.

```bash
bun run build:frontend
./bin/dogfood stop; ./bin/dogfood start
./bin/dogfood semantic record Archboard --walkthrough "Read this board" --out /tmp/archboard.mp4
```

The command prints `Recording: voice is starting.`, then one line per step,
and answers with the file, its size, its duration and the number of steps.

## 2. Watch it

Open the file in a player that plays H.264 with Opus audio (a browser, mpv or
VLC).

| #   | Observe                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------ |
| a   | The video is 1920x1080 and shows only the board: no navigator, header, agent bar, sidebar or caption controls.                 |
| b   | It opens on the whole board, then glides into step 1 while the voice begins explaining it.                                     |
| c   | The voice explains each step in its own words, with names and no ids, and never says a step's number.                          |
| d   | After each explanation there is a short pause, then the next step glides in. No step starts while the voice is still speaking. |
| e   | The voice never asks a question, invites questions, or says it is waiting.                                                     |
| f   | After the last step the voice closes in one sentence, and the video ends a moment later on the last step.                      |

## 3. Discard a board made for the video

```bash
./bin/dogfood semantic new recording-check --input <a board with one walkthrough>.json --doing "checking a recording"
./bin/dogfood semantic record recording-check --out /tmp/check.mp4 --discard --doing "recording the check"
./bin/dogfood semantic show recording-check   # refused: the board is gone
```

Recording writes nothing to the vault. Only `--discard` removes the board it
recorded, and only after the file is written. `git status .archboard/vault` is
clean again once the board is discarded.

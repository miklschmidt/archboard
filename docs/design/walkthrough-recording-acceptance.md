# Recorded walkthrough: real-voice acceptance (TASK-304, TASK-305)

A person runs this on a canvas whose Codex is signed in. It proves what the
deterministic owners cannot: that a real voice model explains each step it is
handed when nobody is listening, falls silent afterwards so the recording
moves on, and ends with the last step. The mechanism is in
[ADR 0035](../adr/0035-a-recording-is-paced-and-captured-by-the-page.md).

## 1. Record this checkout's own board

Voice can stay live in another browser tab. The recording page is a tab of its
own, with its own conversation and voice session (TASK-373).

```bash
bun run build:frontend
./bin/dogfood stop; ./bin/dogfood start
./bin/dogfood semantic record Archboard --walkthrough "Read this board" --out /tmp/archboard.mp4
```

The command prints `Recording: voice is starting.`, then one line per step,
and answers with the file, its size, its duration and the number of steps.

## 2. Watch it

Open the file in a browser. With `ffmpeg` on `PATH` its sound is AAC and it
plays with sound in Safari too; without one the command said so, and it plays
with sound in Chromium, Firefox, mpv and VLC.

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

## 4. Record a pull request for its reviewers

Follow the archboard skill's
[pull request's recording](../../skills/archboard/references/sequences-views-walkthroughs.md#a-pull-requests-recording)
for a real pull request, with `ffmpeg` on `PATH`, and attach the file to it.

| #   | Observe                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------- |
| a   | The command said nothing about sound, and the receipt's `mimeType` names `mp4a.40.2`.                    |
| b   | What the pull request added and changed is marked on screen, and a removed part is drawn as removed.     |
| c   | The video plays with sound in the pull request's page in Chromium, Firefox and Safari.                   |
| d   | Somebody who has not read the diff can say what the pull request changed and why after watching it once. |

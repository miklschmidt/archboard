# Narrated walkthrough: real-voice acceptance (TASK-251)

A person runs this with a real microphone and speaker. It proves what the
deterministic owners cannot: that the voice model paces a talk, that the
picture is on the step before the words are, and how long the silence between
two steps is. It assumes the
[real-voice smoke](codex-workbench-voice-acceptance.md) already passes on this
machine: sign-in, microphone, speaker, and one linked workhorse.

The flow being proven is in
[DESIGN.md](../../DESIGN.md#2-mid-conversation-context--the-bound-app-server-session).
In short: Narrate starts voice knowing only the walkthrough's name; the voice model
asks the coordinator for step 1; the coordinator calls
`archboard_voice.present_step`, which answers only once the pane says the step
has arrived; the coordinator hands the step back as prose; the voice model
explains it and asks for the next step only when it has finished.

## 1. Start on this checkout's own vault

The `present_step` tool changed the coordinator's tool catalogue, so a
coordinator kept from before this change is replaced on the first start. That
is by design, and it means the first voice start after upgrading takes a moment
longer.

```bash
bun run build:frontend
./bin/dogfood stop; ./bin/dogfood start
./bin/dogfood browser show Archboard --pane primary
```

Open <http://127.0.0.1:3000/?paneA=Archboard>, link a workhorse to the pane in
the agent dock, and wait until the voice control offers Start. Do not start
voice from the dock.

## 2. Narrate

1. Open the pane's sidebar, choose the walkthrough "Read this board". The
   presentation opens on step 1 of 4.
2. Step to 3 with the arrow key, so the start is not already on step 1.
3. Press **Narrate** in the caption. Allow the microphone if asked.

Observe, in order:

| #   | Observe                                                                                                                                     | Criterion |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| a   | The pane returns to step 1 and voice starts; without you saying anything, the voice names the walkthrough and asks for step 1.              | AC 1      |
| b   | The voice explains step 1 only after the picture is on it, in its own words, with names and no ids.                                         | AC 2, 3   |
| c   | Without being asked, the pane glides to step 2 after the voice finishes step 1, and the voice starts step 2 once the glide has landed.      | AC 3      |
| d   | Interrupt mid-step with a question about the board. The voice answers; the pane stays on that step until the answer is done, then goes on.  | AC 4      |
| e   | During a step, press the right arrow twice. The voice says it is following you and explains the step now on screen, then continues from it. | AC 5      |
| f   | After the last step the voice says the walkthrough is complete and does not ask for another step.                                           | AC 3      |
| g   | Narrate again, and press Escape mid-step. The voice stops presenting and says so briefly; the pane has left the presentation.               | AC 5      |

A by-hand step reaches the voice model as speakable text, the path a
coordinator's answer takes, because in a full-duplex session appended text is
only quiet context (Codex 0.155.1). If (e) still does not make it speak, note
what it did instead.

## 3. Ask for a narration by voice instead

Start voice from the dock (an ordinary session), and say: "Present the
walkthrough on this board." The coordinator names the walkthrough on its first
`present_step` call. Observe (a) to (c) again. The voice model is never given the steps in advance in either mode: each one reaches it from the coordinator.

## 4. Record the silence between steps

After section 2, before stopping voice:

```bash
curl -s http://127.0.0.1:3000/api/voice/narration-timing | jq '.steps'
```

Each entry is one step. `endToNextStartMs` is the time from the voice finishing
the previous explanation to it starting this one: the number TASK-251 asks for.
`endToArrivedMs` is how much of that was the coordinator turn and the glide, and
`arrivedToStartMs` how much was the coordinator's reply reaching the voice
model. `utterancesBetween` counts what the voice said in between. A narration starts
with the Realtime API's filler off, so 0 is a clean measurement; anything
higher means you interrupted or the voice talked while it waited. The first step has no previous explanation, so its gap is
null. Starting voice again clears the record.

Paste the entries for steps 2 to 4 of an uninterrupted run into TASK-251.

## 5. Stop

Stop voice from the dock, then `./bin/dogfood stop`. Presenting and narrating
write nothing: `git status .archboard/vault` is clean.

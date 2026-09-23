# Narrated walkthrough: real-voice acceptance (TASK-251)

A person runs this with a real microphone and speaker. It proves what the
deterministic owners cannot: that a real voice model explains the step it is
handed, without being spoken to, and then waits for the user. It assumes the
[real-voice smoke](codex-workbench-voice-acceptance.md) already passes on this
machine: sign-in, microphone, speaker, and one linked workhorse.

The flow being proven is in
[DESIGN.md](../../DESIGN.md#2-mid-conversation-context--the-bound-app-server-session).
In short: the user steps the presentation by hand and the voice explains the
step on screen. Narrate starts voice knowing only the walkthrough's name; the
host opens step 1 in the pane and, once the pane says it arrived, hands it to
the voice model as speech. Every step the user moves to after that is handed
over the same way, and so is leaving. No coordinator turn is involved.

## 1. Start on this checkout's own vault

The coordinator's tool catalogue lost `present_step`, so a coordinator kept
from before this change is replaced on the first start. That is by design, and
it means the first voice start after upgrading takes a moment longer.

```bash
bun run build:frontend
./bin/dogfood stop; ./bin/dogfood start
./bin/dogfood browser show Archboard --pane primary
```

Open <http://127.0.0.1:3000/?paneA=Archboard>, link a workhorse to the pane in
the agent dock, and wait until the voice control offers Start. Do not start
voice from the dock.

## 2. Narrate

1. Open the pane's sidebar, choose the walkthrough "Read this board", and step
   to 3 with the arrow key, so the start is not already on step 1.
2. Press **Narrate** in the caption. Allow the microphone if asked.

Observe, in order:

| #   | Observe                                                                                                                        | Criterion |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --------- |
| a   | The pane returns to step 1 and voice starts; without you saying anything, the voice explains step 1 once the picture is on it. | AC 1      |
| b   | It explains in its own words, with names and no ids, and never says the step number or the total.                              | AC 1      |
| c   | When it has finished, it waits: the pane stays on step 1 and the voice neither goes on nor asks to.                            | AC 3      |
| d   | Press the right arrow. The voice explains the step now on screen, then waits again.                                            | AC 2, 3   |
| e   | Press the right arrow twice quickly, mid-explanation. The voice drops what it was saying and explains the step on screen.      | AC 2      |
| f   | Interrupt mid-step with a question about the board. The voice answers, then finishes the step if it was cut off.               | AC 3      |
| g   | Step to the last step. After explaining it the voice says the walkthrough is complete and invites questions.                   | AC 2      |
| h   | Narrate again, and press Escape mid-step. The voice acknowledges it in a few words and narrates nothing more.                  | AC 4      |

Every step and leaving reach the voice model as speakable text, the path a
coordinator's answer takes, because in a full-duplex session appended text is
only quiet context (Codex 0.155.1). If (a), (d) or (h) does not make it speak,
note what it did instead.

## 3. Stop

Stop voice from the dock, then `./bin/dogfood stop`. Presenting and narrating
write nothing: `git status .archboard/vault` is clean.

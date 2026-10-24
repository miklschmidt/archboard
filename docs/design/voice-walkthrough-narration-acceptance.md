# Narrated walkthrough: real-voice acceptance (TASK-251)

A person runs this with a real microphone and speaker. It proves what the
deterministic owners cannot: that a real voice model explains the step it is
handed, without being spoken to, and then waits for the user. It assumes the
[real-voice smoke](codex-workbench-voice-acceptance.md) already passes on this
machine: sign-in, microphone and speaker.

The Codex session it runs on is recorded in
[ADR 0019](../adr/0019-the-workbench-owns-one-codex-app-server-session.md).
In short: the user steps the presentation by hand and the voice explains the
step on screen. Narrate starts voice, and the voice knows only the
walkthrough's name. The Archboard server opens step 1 in the pane. When the pane
says that step 1 arrived, the server hands it to the voice model as speech.
Every step the user moves to after that is handed
over the same way, and so is leaving. No coordinator turn is involved.

## 1. Start on this checkout's own vault

The coordinator's tool catalogue lost `present_step`, so a coordinator kept
from before this change is replaced on the first start. That is by design, and
it means the first voice start after upgrading takes a moment longer.

```bash
bun run build
archboard stop; archboard start
archboard browser show Archboard --pane primary
```

Open `<url>/?paneA=Archboard`, with the URL that `start` printed: port 3000 in
the main checkout, the worktree's own port in a worktree. Do not start voice with Talk.
Narrate starts it. If the tab holds no conversation yet, Narrate first signs
in to Codex as needed and starts the conversation of the tab.

## 2. Narrate

1. Open the pane's sidebar, choose the walkthrough "Read this board", and step
   to 3 with the arrow key, so the start is not already on step 1.
2. Press **Narrate** at the foot of the walkthrough box. If the browser asks, allow the microphone.

Observe, in order:

| #   | Observe                                                                                                                                                                                                                                | Criterion        |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| a   | The pane returns to step 1 and voice starts. When the picture is on step 1, the voice explains it without you saying anything.                                                                                                         | AC 1             |
| b   | It explains in its own words, with names and no ids, and never says the step number or the total.                                                                                                                                      | AC 1             |
| c   | When it finishes, it waits: the pane stays on step 1 and the voice neither goes on nor asks to.                                                                                                                                        | AC 3             |
| d   | Press the right arrow. The voice explains the step now on screen, then waits again.                                                                                                                                                    | AC 2, 3          |
| e   | Press the right arrow twice quickly, mid-explanation. The voice drops what it was saying and explains the step on screen.                                                                                                              | AC 2             |
| f   | Interrupt mid-step with a question about the board. The voice answers. If the question cut off the step, the voice then finishes it.                                                                                                   | AC 3             |
| g   | Step to the last step. After explaining it the voice says the walkthrough is complete and invites questions.                                                                                                                           | AC 2             |
| h   | Narrate again, and press Escape mid-step. The voice acknowledges it in a few words and narrates nothing more.                                                                                                                          | AC 4             |
| i   | Narrate again. Mid-step, click a part on the board. Once it finishes its sentence the voice names what you picked and asks whether you have a question about it. Answer or say no: it finishes the step if it was cut off, then waits. | TASK-293.05 AC 6 |
| j   | Mid-step, click empty canvas. The voice goes on: an emptied selection does not stop the talk.                                                                                                                                          | TASK-293.05 AC 6 |
| k   | Mid-step, from a terminal, make a small edit to the narrated board with `archboard semantic edit`, without `--as-session`, as another agent would. The voice says the board changed under the talk and asks how to go on.              | TASK-293.06 AC 4 |
| l   | Mid-step, from a terminal, run `archboard browser show <another board> --pane primary`. The voice says an agent moved the pane, never that you did, and narrates nothing more.                                                         | TASK-293.06 AC 4 |

Every step and leaving reach the voice model as speakable text, the path that a
coordinator's answer takes. This path is necessary because, in a full-duplex
session, appended text is only quiet context (Codex 0.160.0). If (a), (d) or (h)
does not make it speak,
note what it did instead.

## 3. Stop

End voice with its key in the agent dock, then `archboard stop`. Presenting and narrating
write nothing: apart from the edit of row k, which `git checkout .archboard/vault` undoes,
`git status .archboard/vault` is clean.

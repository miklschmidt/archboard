# Codex workbench real-voice acceptance

This is the release smoke for one Archboard server, its one package-local Codex
app-server, and one person. It covers exact Codex 0.160.0 text and real audio.
Run it after the deterministic owners pass. It is not a stress, performance,
multi-server, or concurrency exercise.

The person running the smoke owns every process and browser tab it starts. Do
not stop an existing server unless you started it. Do not record credentials,
sign-in URLs, tokens, account identities, process environments, or audio. The
real-audio section cannot be replaced with a fake microphone, prerecorded
media, or a controlled-media test.

## What is automated and what a person observes

| Evidence                                                                                                                                                                                                | Authority                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Exact binary, private roots, effective SQLite config, protocol behavior, reconnect sequencing, semantic delivery, callback correlation, spoken-approval gating, and rendered controlled-media lifecycle | Deterministic commands below              |
| Microphone input is intelligible, speaker output is audible, the response is useful, one user message survives reconnect once, board intent is understood, and one spoken approval settles              | The person at the real browser            |
| Board version changes once for the requested write, queue or steer state is visible, End releases the voice session, a new voice session starts, and shutdown is clean                                  | Product interfaces plus human observation |

A controlled-media browser owner proves lifecycle wiring. It does not prove
that this machine's microphone, speaker, browser permission, WebRTC path, or
signed-in account works.

## 1. Record a safe run identity

Run from the Archboard checkout. Use a fresh disposable vault and a marker that
contains no username, repository secret, or account detail.

```bash
accept_run="voice-$(date -u +%Y%m%dT%H%M%SZ)"
accept_home="$(mktemp -d -t archboard-voice-acceptance.XXXXXX)"
accept_board="voice-acceptance-${accept_run}"
mkdir -p "$accept_home/.archboard/vault"
```

The vault of this run is `$accept_home/.archboard/vault`. Every command below that
calls a vault gives `-C "$accept_home"`. Keep those three values in the terminal for this run. Record only the run
marker in review evidence. Replace the vault and state paths with `<vault>` and
`<state-root>` in any retained failure note.

## 2. Run the deterministic gates

Install once if this is a clean worktree, then run only these focused owners.
Each focused test command has a 25-second limit before termination, followed by
at most five seconds for forced cleanup. Installation and the frontend build
are separate prerequisites. A timeout,
signal, prerequisite refusal, or nonzero exit is a failed gate, not a pass.

```bash
bun install
bun run build
test "$(node_modules/.bin/codex --version)" = "codex-cli 0.160.0"

timeout -k 5s 25s bun test \
  packages/codex-app-server/tests/runtime/store/storage.test.ts \
  packages/codex-app-server/tests/runtime/processes/process-lifecycle.test.ts \
  packages/codex-app-server/tests/runtime/store/storage-proof.test.ts

timeout -k 5s 25s bun test \
  packages/workbench/tests/server/services/gateway/sequenced-delivery.test.ts \
  src/server/archboard/tests/codex-workbench-text-actions.test.ts \
  src/ui/workbench-transport/tests/stream-reduction.test.ts \
  src/ui/workbench-composer/tests

timeout -k 5s 25s bun test \
  packages/codex-app-server/tests/runtime/operations/semantic-context-publisher.test.ts \
  packages/codex-app-server/tests/runtime/operations/semantic-listener-fanout.test.ts \
  packages/codex-app-server/tests/runtime/operations/semantic-source-failure.test.ts \
  packages/codex-app-server/tests/runtime/operations/semantic-truncated-reconciliation.test.ts \
  packages/codex-app-server/tests/runtime/schemas/semantic-brief-boundaries.test.ts \
  packages/codex-app-server/tests/runtime/schemas/semantic-context-types.test.ts \
  packages/workbench/tests/runtime/services/thread-context \
  packages/workbench/tests/runtime/services/coordinator-callbacks \
  packages/workbench/tests/runtime/services/spoken-approval

timeout -k 5s 25s bun tests/system/browser/run-browser-lane.ts \
  --focus tests/system/browser/codex-text-workbench.test.ts

timeout -k 5s 25s bun tests/system/browser/run-browser-lane.ts \
  --focus tests/system/browser/codex-live-voice.test.ts
```

Do not continue to real audio if any gate fails. Do not substitute the full
browser lane, normal gate, system suite, repository-policy suite, or any opt-in
stress, performance, tooling, topology, or concurrency command.

For each command, record the exit and elapsed time. The useful claim is the
named contract that passed, not the number of assertions.

## 3. Start one clean production composition

First inspect the shared lifecycle.

```bash
./bin/archboard status
```

If it reports a running server that this acceptance run did not start, stop and
report the existing owner as the blocker. Do not signal it. If it is a process
from an earlier attempt that you own, stop it with `./bin/archboard stop`. Stop
never refuses: every accepted write is on disk before it is answered.

Start the server and create the empty acceptance board.

```bash
./bin/archboard start
./bin/archboard status
echo '{"level":"module"}' |
  ./bin/archboard -C "$accept_home" semantic new "$accept_board" --doing "starting the voice acceptance board"
./bin/archboard -C "$accept_home" semantic show "$accept_board"
```

The status must name a running server with zero browser clients before the
browser opens. Keep the initial board version from `semantic show`.

### Prove the dedicated roots without exposing them

On Linux, Archboard's workbench root is below the XDG state directory. This
check prints only ownership and mode facts. It also proves that `config.toml`
names the separate SQLite root as `sqlite_home`.

```bash
accept_state_root="${XDG_STATE_HOME:-$HOME/.local/state}/archboard/codex-workbench"
bun -e '
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
const root = process.argv.at(-1);
if (!root) throw new Error("missing acceptance state root");
const codexHome = realpathSync(join(root, "codex-home"));
const sqliteHome = realpathSync(join(root, "sqlite-home"));
const configPath = realpathSync(join(codexHome, "config.toml"));
const uid = process.getuid?.();
const facts = (path, expectedMode) => {
  const stats = lstatSync(path);
  const mode = stats.mode & 0o777;
  if (uid !== undefined && stats.uid !== uid) throw new Error("wrong storage owner");
  if (mode !== expectedMode) throw new Error("wrong storage mode");
  return { currentOwner: uid === undefined ? "platform-managed" : true,
    mode: mode.toString(8).padStart(4, "0") };
};
if (Bun.TOML.parse(readFileSync(configPath, "utf8")).sqlite_home !== sqliteHome)
  throw new Error("config.toml does not select the dedicated SQLite root");
console.log(JSON.stringify({
  codexHome: facts(codexHome, 0o700),
  sqliteHome: facts(sqliteHome, 0o700),
  config: { ...facts(configPath, 0o600), exactSqliteHome: true },
}, null, 2));
' "$accept_state_root"
```

The app-server startup does the authoritative effective check. It accepts the
workbench only after `initialize.codexHome`, layered `config/read` including the
originating `config.toml`, and `configRequirements/read` all agree with these
private roots. Do not start a second app-server client to inspect the private
session.

## 4. Sign in and start the conversation

Use a 1920×1080 desktop viewport. Open the address `./bin/archboard status`
reports (by default <http://127.0.0.1:3000>) in the real desktop browser, then
point its pane at the acceptance board.

```bash
./bin/archboard browser show "$accept_board" --pane primary -C "$accept_home"
```

There is nothing to set up first. The first message starts the conversation of
the browser tab. If Archboard is signed out, it signs in. It starts Codex and the
voice coordinator of the tab, then creates the workhorse and links it to the tab
(ADR 0019). In the browser:

1. Confirm the header names `$accept_board`.
2. Open the conversation with its key beside Talk. Type `Reply with the word ready.`
   into the composer (`Message the agent`) and press Enter.
3. If Archboard is signed out, the message is held in the panel, the status
   line asks you to sign in, and the ChatGPT sign-in page opens in a new tab.
   If the browser blocked the tab, use `Open the page` in the agent dock.
   Finish signing in there. Do not copy the URL or account details into
   evidence.
4. Without sending again, confirm the held message delivers by itself: the
   status line passes through starting Codex and starting a conversation, and
   the prompt appears once in the conversation followed by the answer. A login
   notification alone is not proof of completion; the delivered prompt is.
   If Archboard was already signed in, the message delivers directly.
5. Open the conversation panel's menu and choose `Session details`. Confirm
   Account says signed in, Conversation shows a model, context use and a
   thread, and Voice shows a model. Record them only as `present`; do not copy
   their values. Choose `Back to the conversation`.

There must be one browser tab, one pane and one conversation. Do not open a
second pane or server.

## 5. Prove text, interrupt, and reconnect

Build this message with the current marker:

```text
User marker <accept_run>. Do not repeat the marker. Run `bun -e 'await Bun.sleep(15000); console.log("ready")'` in this checkout, then report the one-line output.
```

Replace `<accept_run>` with the shell value. Then:

1. Paste it into `Message the agent` and press Enter. Confirm the conversation
   shows the message once, the status line says Working with the current step,
   and the composer now offers to steer the running turn.
2. Press `Stop` in the agent dock while the 15-second command is active. Confirm
   the turn settles as stopped. Do not send another message yet.
3. Reload the browser tab once. If the conversation panel is closed after the
   reload, open it with the conversation key beside Talk in the agent dock.
4. Confirm the same conversation returns, the composer is empty, and the exact
   user-marker message appears once. A held copy of the message, a copy marked
   as possibly not arrived, or a second user item is a failure.

This observation proves reconnect did not resubmit input. If the marker appears
twice, stop without trying the prompt again and retain only the marker, stages,
and visible error text.

## 6. Prove real microphone and speaker audio

Before starting, confirm that the operating system has a connected default
microphone and an audible output device. In particular, a disconnected USB
microphone can remain the configured default. On a PipeWire desktop,
`wpctl status` and `wpctl inspect @DEFAULT_AUDIO_SOURCE@` can identify this
problem; inspect locally without retaining device details. Select the intended
physical input in system audio settings or reconnect it.

Press `Talk` in the agent dock and grant microphone permission if asked. Talk
sets up whatever voice still needs, then turns into the live control. With
subtitles on, the voice box rises over the pane with the orb lit in it, the word
Listening or Speaking, `Mute` and the subtitles control, and the key reads
`End voice`. The orb does not fly out of the Talk key. With subtitles off, the live control is the circle at the head of
the dock, with the same word, `Mute` and the subtitles control beside it. If Talk comes back
with a warning instead, hover it for the reason. For `Requested device not
found`, repair the default input and press Talk again. Successful SDP
negotiation does not prove microphone capture. Do not use virtual devices. Say:

```text
What is the first heading in TESTING.md, and which board are we viewing? Answer in one short sentence.
```

Voice never opens the conversation panel; open it with the conversation toggle
if it is closed. What was said aloud is the Voice lines at the foot of the
conversation: your words as `You`, the answer as `Voice`. Confirm all of these
by direct observation:

- the live word changes from Listening to Speaking while the answer plays, and
  the orb moves with the spoken answer when reduced motion is off (with
  reduced motion it is drawn at rest);
- your final words appear once as a `You` line;
- a relevant answer, naming `$accept_board`, is audible through the real
  speaker;
- the same answer appears once as a `Voice` line, and with subtitles on it is
  shown over the pane while it plays;
- with subtitles on, the voice is in the voice box over the pane: its orb moves
  with the spoken answer beside the words, and the key in the agent dock reads
  End voice. Turning subtitles off from the box flies the orb to the circle at
  the head of the dock, and turning them on from the dock flies it back;
- the pane still shows `$accept_board`, and the thread in `Session details` is
  the one it showed in section 4 (compare on screen; do not record it).

A Voice line without audible output, or audible output without the matching
Voice line, fails the smoke.

## 7. Prove one bounded board write and live semantics

Read the current version with `./bin/archboard -C "$accept_home" semantic show "$accept_board"`.
Then say this exact bounded request:

```text
Make one direct board change. Add one node named Voice smoke <accept_run> to the open acceptance board. Use one archboard semantic edit and make no other board change.
```

After the voice reports completion, run:

```bash
./bin/archboard -C "$accept_home" semantic show "$accept_board"
```

The version must advance by exactly one and the board must hold exactly the
requested node. The pane must draw the new node without a reload: that is the
live semantics, the browser reading the board again when the server announces
the new version.

## 8. Prove queue ownership and a semantic callback

Send a second message from the composer:

```text
Run `bun -e 'await Bun.sleep(15000); console.log("busy turn finished")'`, then report the one-line output.
```

While the agent dock shows `Stop`, say:

```text
Queue exactly one follow-up for the linked workhorse. Its prompt is: read TESTING.md and reply with only its first heading. Do not steer the active turn and do not add another queue item.
```

Confirm the foot of the conversation shows one queued prompt, the status line
counts one queued, and the voice says it queued rather than steered the
workhorse. After the active turn settles, say `Start that one queued follow-up
now.` Confirm the queued prompt starts once, as one new turn in the
conversation. When it finishes, the voice must report the first heading by
itself, once, with no spoken polling loop in the Voice lines. That callback is
the semantic completion evidence.

If the workhorse is no longer active when the queue request arrives, start the
15-second turn again with a new marker before asking for a queue operation. Do
not reinterpret an idle direct turn as queue evidence.

## 9. Prove one spoken binary approval and its visual fallback

Keep voice running. Say:

```text
Use the shell to run `git status --short`, but explicitly request approval for this one command before running it. Do not request a session grant.
```

Wait for the effect prompt. The status line says the agent needs you; an
approval never opens the panel by itself, so open it with `Review` if it is
closed. Confirm one ordinary command approval card is pending at the foot of
the conversation, it says the approval can be answered aloud, and its decision
buttons remain available as fallback. Only after the effect prompt finishes,
say:

```text
Approve that exact command.
```

Confirm the final user utterance appears once, the card settles once without a
button press, and the command runs once. Do not click the fallback for this
proof. If spoken classification is ambiguous or refused, leave the card for
the visual surface, record the visible reason, and fail this run. A fresh run
must raise a new approval; never repeat an approval whose outcome is unknown.

## 10. End voice, start a new voice session, and shut down

1. Press `End voice` in the agent dock. Confirm the live control returns to
   `Talk`, the orb, the voice box and the active audio transport disappear, and
   the composer remains usable.
2. Press `Talk` again. Say `Reply with the word restarted.` Confirm one new
   `You` line and one audible `restarted` response.
3. Press `End voice` again. Close the browser tab that this run opened.
4. Stop only this run's server.

```bash
./bin/archboard stop
./bin/archboard status
```

The final status must be stopped. Confirm the owned app-server
child exits and the browser microphone indicator is gone; CLI status alone
does not prove browser media cleanup. Keep the dedicated
Codex roots because they contain the supported sign-in. The first command with
`-C "$accept_home"` registered that directory as an untracked vault, so forget it.
Then remove only the exact disposable directory after validating its prefix:

```bash
case "$accept_home" in
  /tmp/archboard-voice-acceptance.*) ./bin/archboard repo forget "$accept_home" && rm -rf -- "$accept_home" ;;
  *) echo "refusing to remove unexpected directory path" >&2; exit 1 ;;
esac
```

## Evidence ledger

Record one row per run. Use `pass`, `fail`, or `not reached`.

| Checkpoint                             | Result | Safe evidence                                                  |
| -------------------------------------- | ------ | -------------------------------------------------------------- |
| Exact 0.160.0 and deterministic owners |        | Commands, exits, elapsed seconds                               |
| Clean server and one app-server        |        | Status facts, no pid or argv dump                              |
| Private config and effective SQLite    |        | `0700`, `0700`, `0600`, exact match, readiness label           |
| Signed-in conversation                 |        | Signed in, one conversation, session details present           |
| Text, interrupt, reconnect             |        | Marker, interrupted, one user item after reload                |
| Real microphone and speaker            |        | Human heard and spoke; no media retained                       |
| One bounded board write                |        | Board version before and after, matching node name             |
| Queue and callback                     |        | One queued item, one start, one correlated completion          |
| Spoken approval and fallback           |        | Eligible card visible, utterance settled once, buttons visible |
| End, new voice session, shutdown       |        | Two ends, one fresh start, final stopped status                |

For a failure, keep the run marker, checkpoint, exact visible recovery text,
command exit, and elapsed time. Redact checkout, state, and vault paths. Do not
retain raw app-server logs unless a maintainer first proves they contain no
credentials or conversation content. Never retain audio or browser sign-in
captures.

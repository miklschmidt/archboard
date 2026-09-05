# Codex workbench real-voice acceptance

This is the release smoke for one Archboard server, its one package-local Codex
app-server, and one person. It covers exact Codex 0.151.0 text and real audio.
Run it after the deterministic owners pass. It is not a stress, performance,
multi-server, or concurrency exercise.

The person running the smoke owns every process and browser tab it starts. Do
not stop an existing server unless you started it and have confirmed that it
has no held board. Do not record credentials, sign-in URLs, tokens, account
identities, process environments, or audio. The real-audio section cannot be
replaced with a fake microphone, prerecorded media, or a controlled-media test.

## What is automated and what a person observes

| Evidence                                                                                                                                                                                                | Authority                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Exact binary, private roots, effective SQLite config, protocol behavior, reconnect sequencing, semantic delivery, callback correlation, spoken-approval gating, and rendered controlled-media lifecycle | Deterministic commands below              |
| Microphone input is intelligible, speaker output is audible, the response is useful, one user message survives reconnect once, board intent is understood, and one spoken approval settles              | The person at the real browser            |
| Board version changes once for the requested write, queue or steer state is visible, Stop releases the session, a new voice session starts, and shutdown is clean                                       | Product interfaces plus human observation |

A controlled-media browser owner proves lifecycle wiring. It does not prove
that this machine's microphone, speaker, browser permission, WebRTC path, or
signed-in account works.

## 1. Record a safe run identity

Run from the Archboard checkout. Use a fresh disposable vault and a marker that
contains no username, repository secret, or account detail.

```bash
accept_run="voice-$(date -u +%Y%m%dT%H%M%SZ)"
accept_vault="$(mktemp -d -t archboard-voice-acceptance.XXXXXX)"
accept_board="voice-acceptance-${accept_run}"
export ARCHBOARD_VAULT="$accept_vault"
```

Keep those three values in the terminal for this run. Record only the run
marker in review evidence. Replace the vault and state paths with `<vault>` and
`<state-root>` in any retained failure note.

## 2. Run the deterministic gates

Install once if this is a clean worktree, then run only these focused owners.
Each command has a 25-second outer limit, including its own cleanup. A timeout,
signal, prerequisite refusal, or nonzero exit is a failed gate, not a pass.

```bash
bun install
test "$(node_modules/.bin/codex --version)" = "codex-cli 0.151.0"

timeout -k 5s 25s bun test \
  src/runtime/codex-process/tests/storage.test.ts \
  src/runtime/codex-process/tests/process-lifecycle.test.ts \
  src/runtime/codex-session/tests/storage.test.ts

timeout -k 5s 25s bun test \
  src/server/codex-workbench/tests/sequenced-delivery.test.ts \
  src/ui/workbench-transport/tests/stream-reduction.test.ts \
  src/ui/workbench-composer/tests/mounted-composer.test.tsx

timeout -k 5s 25s bun test \
  src/runtime/codex-semantic-context/tests \
  src/runtime/codex-thread-context/tests \
  src/runtime/codex-coordinator-callbacks/tests \
  src/runtime/codex-spoken-approval/tests

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
./bin/canvas status
```

If it reports a running server that this acceptance run did not start, stop and
report the existing owner as the blocker. Do not signal it. If it is a process
from an earlier attempt that you own, run `./bin/canvas board list`, resolve any
reported held board through the named recovery choices, then use the guarded
`./bin/canvas stop`.

Start the server and create the empty acceptance board.

```bash
./bin/canvas start
./bin/canvas status
./bin/canvas board new "$accept_board" --level module
./bin/canvas board info --board "$accept_board"
```

The status must name a running server with zero browser clients before the
browser opens. Keep the initial board version from `board info`.

### Prove the dedicated roots without exposing them

On Linux, Archboard's workbench root is below the XDG state directory. This
check prints only ownership and mode facts. It also proves that `config.toml`
contains the one canonical `sqlite_home` line for the separate SQLite root.

```bash
accept_state_root="${XDG_STATE_HOME:-$HOME/.local/state}/excalidraw-canvas/codex-workbench"
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
const expected = `sqlite_home = ${JSON.stringify(sqliteHome)}\n`;
if (readFileSync(configPath, "utf8") !== expected)
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

## 4. Sign in and link one workhorse

Use a 1920×1080 desktop viewport. Open the real desktop browser through the public interface.

```bash
./bin/canvas browser open
./bin/canvas browser show "$accept_board" --pane primary
```

In the browser:

1. Expand the Agent drawer. Confirm the board name matches `$accept_board`, then open `Settings`.
2. Confirm `Codex account: Signed in`. If it is signed out, choose `Hosted
ChatGPT`, press `Sign in`, and finish the hosted flow. Do not copy the URL or
   any account detail into evidence.
3. Confirm `Start agent` is enabled. If it is unavailable, resolve the reason
   shown in settings before continuing.
4. Press `Start agent`. Settings closes and the message composer receives focus.
   Reopen `Settings` and expand `Conversation details` and `Coordinator details`
   to inspect the linked identities. Record them only as `present`; do not copy
   their opaque values. Close settings to return to the conversation.

There must be one browser, one pane, one linked workhorse, and one coordinator.
Do not open a second pane or server.

## 5. Prove text, interrupt, and reconnect

Build this message with the current marker. Paste it into `Message the Codex
workhorse`:

```text
User marker <accept_run>. Do not repeat the marker. Run `bun -e 'await Bun.sleep(15000); console.log("ready")'` in this checkout, then report the one-line output.
```

Replace `<accept_run>` with the shell value. Then:

1. Press `Send`. Confirm the authoritative workhorse timeline shows the user
   message and the composer changes to `Steer the current Codex turn`.
2. Press `Interrupt` while the 15-second command is active. Confirm the timeline
   settles the turn as interrupted. Do not send another message yet.
3. Reload the browser tab once. Expand the workbench after it reconnects.
4. Confirm the same link and authoritative timeline return, the composer is
   empty, and the exact user-marker message appears once. A retained
   `Unsent message, outcome unknown` copy or a second user item is a failure.

This observation proves reconnect did not resubmit input. If the marker appears
twice, stop without trying the prompt again and retain only the marker, stages,
and visible error text.

## 6. Prove real microphone and speaker audio

Press `Start voice on this pane` and grant the browser microphone permission if
asked. Do not use virtual devices. Say:

```text
What is the first heading in TESTING.md, and which board are we viewing? Answer in one short sentence.
```

Open the `Voice` disclosure for transcript and context. Confirm all of these by direct observation:

- the live meter reacts to your real voice;
- your final words appear once in the voice transcript;
- a relevant answer is audible through the real speaker;
- the same answer appears once in the coordinator transcript;
- the voice controls still target the same pane; the linked workhorse and
  coordinator in Agent settings remain unchanged.

A transcript without audible output, or audible output without the matching
transcript, fails the smoke.

## 7. Prove one bounded board write and live semantics

Read the current version with `./bin/canvas board info --board "$accept_board"`.
Then say this exact bounded request:

```text
Make one direct board change. Add one rectangle labelled Voice smoke <accept_run> to the open acceptance board. Use one Archboard add command and make no other board change.
```

After the coordinator reports completion, run:

```bash
./bin/canvas board info --board "$accept_board"
./bin/canvas query --board "$accept_board" --type rectangle
```

The version must advance by exactly one and the query must return exactly the
requested rectangle. A labelled rectangle may persist as a shape plus bound
text; that is still one input conversion and one write.

Now drag the rectangle far enough that the move is visibly meaningful. Wait
for the canvas to settle, then ask by voice, `What board change did I just
make?` The coordinator must describe the move from the new semantic context.
This proves that live human board intent reaches the coordinator. Do not count
the coordinator's own write as new human intent.

## 8. Prove queue ownership and a semantic callback

Start a second workhorse turn from the text composer:

```text
Run `bun -e 'await Bun.sleep(15000); console.log("busy turn finished")'`, then report the one-line output.
```

While its `Interrupt` control is visible, say:

```text
Queue exactly one follow-up for the linked workhorse. Its prompt is: read TESTING.md and reply with only its first heading. Do not steer the active turn and do not add another queue item.
```

Open the `Queue` disclosure and confirm it shows one queued submission and the coordinator says
it queued rather than steered the workhorse. After the active turn settles,
say `Start that one queued follow-up now.` Confirm the queue item starts once.
When it finishes, the coordinator timeline must show the correlated operation
callback and the first heading result without a spoken polling loop. That
callback is the semantic completion evidence.

If the workhorse is no longer active when the queue request arrives, start the
15-second turn again with a new marker before asking for a queue operation. Do
not reinterpret an idle direct turn as queue evidence.

## 9. Prove one spoken binary approval and its visual fallback

Keep voice running. Say:

```text
Use the shell to run `git status --short`, but explicitly request approval for this one command before running it. Do not request a session grant.
```

Wait for the effect prompt. In the workbench, confirm one ordinary command
approval card is pending, it says `Spoken approval available`, and the visible
`Approve` and `Decline` buttons remain available as fallback. Only after the
effect prompt finishes, say:

```text
Approve that exact command.
```

Confirm the final user utterance appears once, the card settles once without a
button press, and the command runs once. Do not click the fallback for this
proof. If spoken classification is ambiguous or refused, leave the card for
the visual surface, record the visible reason, and fail this run. A fresh run
must raise a new approval; never repeat an approval whose outcome is unknown.

## 10. Stop, start a new voice session, and shut down

1. Press the visible `Stop voice` control. Confirm the meter stops, the active
   audio transport disappears, and the text workbench remains usable.
2. Press `Start voice` again. Say `Reply with the word restarted.` Confirm one
   new final user item and one audible `restarted` response.
3. Press `Stop voice` again. Close the browser tab that this run opened.
4. Confirm no held board, then stop only this run's server.

```bash
./bin/canvas board list
./bin/canvas stop
./bin/canvas status
```

The final status must be stopped. The guarded stop must not report held work,
an app-server child, or a browser media owner left behind. Keep the dedicated
Codex roots because they contain the supported sign-in. Remove only the exact
disposable vault after validating its prefix:

```bash
case "$accept_vault" in
  /tmp/archboard-voice-acceptance.*) rm -rf -- "$accept_vault" ;;
  *) echo "refusing to remove unexpected vault path" >&2; exit 1 ;;
esac
```

## Evidence ledger

Record one row per run. Use `pass`, `fail`, or `not reached`.

| Checkpoint                             | Result | Safe evidence                                                  |
| -------------------------------------- | ------ | -------------------------------------------------------------- |
| Exact 0.151.0 and deterministic owners |        | Commands, exits, elapsed seconds                               |
| Clean server and one app-server        |        | Status facts, no pid or argv dump                              |
| Private config and effective SQLite    |        | `0700`, `0700`, `0600`, exact match, readiness label           |
| Signed-in text workbench               |        | Signed in, one link, identities present                        |
| Text, interrupt, reconnect             |        | Marker, interrupted, one user item after reload                |
| Real microphone and speaker            |        | Human heard and spoke; no media retained                       |
| One bounded board write                |        | Board version before and after, matching label                 |
| Queue and callback                     |        | One queued item, one start, one correlated completion          |
| Spoken approval and fallback           |        | Eligible card visible, utterance settled once, buttons visible |
| Stop, new voice session, shutdown      |        | Two stops, one fresh start, final stopped status               |

For a failure, keep the run marker, checkpoint, exact visible recovery text,
command exit, and elapsed time. Redact checkout, state, and vault paths. Do not
retain raw app-server logs unless a maintainer first proves they contain no
credentials or conversation content. Never retain audio or browser sign-in
captures.

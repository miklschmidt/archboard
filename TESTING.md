# Running and verifying Archboard

This file is for a developer or an agent who works in this checkout. It shows
how to run a server of your own, write and read a board, see it in a browser,
and test a change. [INSTALL.md](INSTALL.md) covers installation on a machine.
[docs/agents/test-suite.md](docs/agents/test-suite.md) covers the test lanes.
`./bin/archboard --help` and the `--help` of each command describe the flags.

## 1. Prepare the checkout

```bash
bun install      # if it fails while it extracts a tarball, run it again
bun run build    # builds the browser bundle into dist/frontend
```

`bun install` installs the Codex version that `package.json` pins. The server
runs only that Codex, never one on your `PATH`. The install also generates the
Codex app-server contract and the generated references of the skill. Bun runs
the CLI and the server from `src/`, so nothing else is built (ADR 0014).

A new worktree needs its own `bun install` and `bun run build`. A
`node_modules` that links to another checkout fails the contract check.

## 2. Run a server of your own

Your everyday Archboard server probably runs on `http://127.0.0.1:3000`, the
default address, with your own vault. Every command talks to the server at
`ARCHBOARD_URL`. If nothing answers there, the command starts a server. Give a
test session its own port and a copy of the example vault:

```bash
export ARCHBOARD_URL=http://127.0.0.1:3414
export ARCHBOARD_VAULT=$(mktemp -d)/vault
cp -r examples/web-shop "$ARCHBOARD_VAULT"
./bin/archboard start
./bin/archboard status
```

`examples/web-shop` holds three boards with proposals, views, walkthroughs and
groups. Its `config.yaml` defines the kinds that the examples below use. `start`
prints the URL and the process id of the server. `status` says whether the
server runs, how many boards it sees and how many browser pages are open.

A server keeps the vault that it started with. It also keeps the source that it
read at start:

- After you edit a file under `src/`, run
  `./bin/archboard stop && ./bin/archboard start`. Until you do, `status`
  reports the changed file under `stale`.
- After you edit frontend code, run `bun run build` and reload the page.
- `bun run dev` serves a frontend that reloads itself, but it always talks to
  the server on port 3000.

All servers on a machine share one Codex sign-in. If you sign out in a test
server, you sign out every server. On Linux, you can keep a test server away
from your sign-in: set `XDG_STATE_HOME` to an empty directory before `start`.
The test server then starts with no sign-in, and it keeps its log in that
directory.

`./bin/dogfood` runs the CLI against the boards of this repository, in
`.archboard/vault`. Read them as you like. Change them only through the
proposal of a task, as the `archboard-dev` skill describes.

## 3. Write and read a board

Every write says what it does with `--doing`. A write to a board that already
exists also gives the version that you read, with `--expect-version`. If the
board changed after you read it, the write is refused with exit code 5.

```bash
echo '{"level": "system",
  "nodes": [{"name": "API Gateway", "kind": "service"},
            {"name": "Orders", "kind": "service"}],
  "edges": [{"from": "API Gateway", "to": "Orders", "kind": "http",
             "label": "place an order"}]}' |
  ./bin/archboard semantic new payments --doing "drawing the payment path"

./bin/archboard semantic show payments

./bin/archboard semantic branch payments --as "Queued ingest" \
  --summary "Orders arrive through a queue" \
  --expect-version 1 --doing "proposing a queue"

echo '{"nodes": [{"name": "Order queue", "kind": "queue"}],
  "edges": [{"from": "API Gateway", "to": "Order queue", "kind": "queue",
             "label": "enqueue the order"},
            {"from": "Order queue", "to": "Orders", "kind": "queue",
             "label": "deliver"}]}' |
  ./bin/archboard semantic edit payments --variant "Queued ingest" \
  --expect-version 2 --doing "routing orders through a queue"

./bin/archboard semantic compare payments --variant "Queued ingest"
./bin/archboard check
```

Each command prints its answer as JSON on stdout and one sentence on stderr.
The three writes take the board to versions 1, 2 and 3. `compare` reports the
queue and its two relationships as added. If the configuration and every board
in the vault are valid, `check` exits 0.

The board is the file `payments.semantic.json` in the vault. It holds the
current variant and every proposal. Write it only through the CLI.

## 4. Draw it

```bash
out=$(mktemp -d)
./bin/archboard semantic render payments --out "$out/payments.svg"
./bin/archboard semantic render payments --variant "Queued ingest" \
  --out "$out/proposal.svg"
./bin/archboard semantic rasterize payments --out "$out/payments.png"
```

Write pictures outside the checkout, because git does not ignore them there.
`render` needs no browser. It draws the current variant, or a proposal marked
against the current variant. `rasterize` needs Chromium or Google Chrome, as
[INSTALL.md](INSTALL.md#rendering-to-a-bitmap) describes. At the default scale,
the `width` and `height` in the answer of `rasterize` are the ones in the answer
of `render`.

## 5. See it in a browser

Open `$ARCHBOARD_URL/?paneA=payments` in a browser. The `browser` commands need
that page. Without it, `browser show` exits with code 4 and tells you which URL
to open.

```bash
./bin/archboard browser panes
./bin/archboard browser show "payments@Queued ingest"
./bin/archboard browser open
./bin/archboard browser show payments --pane left
./bin/archboard browser show "payments@Queued ingest" --pane right
```

`browser panes` reports the board, the variant and the version of each pane.
`payments@Queued ingest` names the proposal. A pane shows it with what it adds,
changes and removes marked against the current variant. `browser open` splits
the page into two panes, and `--pane left` and `--pane right` then put the
current variant beside the proposal. None of these commands writes a board.

## 6. Talk to Codex

The server starts its own Codex app-server, as
[ADR 0019](docs/adr/0019-the-workbench-owns-one-codex-app-server-session.md)
records. If Codex has no sign-in, the first message in the conversation or the
first press of Talk asks you to sign in. It then starts the conversation. Each
browser tab holds a conversation of its own, and a reload keeps it. Voice
needs a microphone and speakers. If your microphone is on a Bluetooth headset,
a narration can be silent. The [README FAQ](README.md#faq) explains why.

## 7. Test a change

`bun run check` is the complete gate. [docs/agents/test-suite.md](docs/agents/test-suite.md)
describes its lanes, what each lane needs, and which test owns which behavior.
On macOS, use Chrome for Testing. Before every local lane or gate, set
`AGENT_BROWSER_EXECUTABLE_PATH` and `ARCHBOARD_RENDERER_CHROMIUM` to its absolute
executable path in the command environment. Keep these values out of `.env` files.
Bun fixture subprocesses load these files and can add variables outside the fixture's allowed environment.
Desktop Chrome can show system default-browser prompts.

Three facts decide whether the gate can run to its end:

- The checks run one after the other and stop at the first failure. If the gate
  stops early, run the remaining checks and every unrun normal lane separately,
  using the commands in `package.json`'s `check` and `test` chains. Include
  `test:modules` if it has not run, and build the frontend before browser owners.
  Only then call a failure the only one.
- `bun install` supplies the pinned `agent-browser` CLI. The browser lane resolves it from this checkout.
  A missing prerequisite ends the lane with code 2.
- A new worktree needs `bun install` and `bun run build` first.

Some checks need a person, because they need a real voice, a microphone and
speakers:

- [The voice acceptance](docs/design/codex-workbench-voice-acceptance.md), for
  a change to the Codex workbench or its voice path.
- [The recording acceptance](docs/design/walkthrough-recording-acceptance.md),
  for a change to `semantic record` or `semantic replay`. Its automated owners
  run a real headless Chromium with a fake ffmpeg.
  `tests/system/server-state/walkthrough-recording.test.ts` records against a
  fake Codex, and `walkthrough-replay.test.ts` beside it renders a kept talk.

## 8. When something fails

- The exit codes mean: 0 success, 1 an error, 2 wrong usage, 3 no answer from
  the server, 4 no browser page, and 5 a refused board write. `check` exits 1
  while the vault still has diagnostics.
- The answer of a command is JSON on stdout. The reason for a failure is on
  stderr.
- The server log is `archboard.log` in the state directory.
  [INSTALL.md](INSTALL.md#machine-state-and-logs) gives the directory for each
  system.
- The Codex state of each server is in `codex-workbench/canvases/<port>` in the
  state directory. If the Codex of a server cannot start, the server stops with
  "The production Codex workbench did not become ready".

## Evaluations of the archboard skill

[evals/README.md](evals/README.md) describes the model evaluation of the
archboard skill. Only a person starts `bun run eval:skill run` and
`bun run eval:skill grade`, because they call models and a batch takes about
13 GB. An agent never starts them. `bun run eval:skill check` examines the
inputs without a model.

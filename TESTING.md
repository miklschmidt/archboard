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
the CLI and the server directly from TypeScript, so nothing else is built (ADR 0014).

A new worktree needs its own `bun install` and `bun run build`. A
`node_modules` that links to another checkout fails the contract check.

## 2. Run a server of your own

Your everyday Archboard server probably runs on `http://127.0.0.1:3000`, the
default address of the main checkout. Every command talks to the server at
`ARCHBOARD_URL`. If nothing answers there, the command starts a server. Give a
test session its own port, its own registry and a copy of the example vault.
The registry is the file that lists the repositories and vaults the browser
shows. A vault is the `.archboard/vault` directory of a directory, so copy the
example there:

```bash
export ARCHBOARD_URL=http://127.0.0.1:3414
export ARCHBOARD_REPOS=$(mktemp -d)/repos.json
session=$(mktemp -d)
mkdir -p "$session/.archboard"
cp -r examples/web-shop "$session/.archboard/vault"
./bin/archboard start
./bin/archboard status
```

`examples/web-shop` holds three boards with proposals, views, walkthroughs and
groups. Its `config.yaml` defines the kinds that the examples below use. `start`
prints the URL and the process id of the server. `status` says whether the
server runs and how many browser pages are open.

The commands below name the session with `-C "$session"`. Without it, a command
in this checkout uses the boards of this repository. The first command that
names the session registers it in your own registry, and a browser page then
opens in its vault.

Every call to the server names its vault (ADR 0049). The CLI finds its vault
from `-C <dir>`, else from the working directory, and names it on every
call. The browser names the one that
`/api/served-vault` reports. When you call the API by hand, add
`?vault=<directory>`. A call that names no vault gets `VAULT_REQUIRED` with
status 400. The server starts without a vault. A server keeps the source
that it read at start:

- After you edit a file under `apps/` or `packages/`, run `./bin/archboard restart`. It
  stops the server, builds the frontend and starts the server again. Until
  you do, `status` reports the changed file under `stale`.
- After you edit frontend code, run `bun run build` and reload the page.
- `bun run dev` serves a frontend that reloads itself, but it always talks to
  the server on port 3000.

All servers on a machine share one Codex sign-in. If you sign out in a test
server, you sign out every server. On Linux, you can keep a test server away
from your sign-in: set `XDG_STATE_HOME` to an empty directory before `start`.
The test server then starts with no sign-in, and it keeps its log in that
directory.

`archboard` in this checkout finds the boards of this repository in
`.archboard/vault`, from any directory of the checkout. Read the boards as you like. Change them only through the
proposal of a task, as the `archboard-dev` skill describes.

In an archboard checkout, `archboard` runs that checkout's own `bin/archboard`,
even when the `archboard` on your PATH links to another checkout (ADR 0049).
So a worktree runs its own source and has its own server:

- The server of the main checkout listens on port 3000.
- The server of a linked worktree listens on a port from 10000 to 19999. The
  port is a hash of the worktree's path, so it is the same on every run.
  `archboard status` gives the URL.
- A set `ARCHBOARD_URL` or `--url` still decides. A set `ARCHBOARD_URL` also
  stops the hand-off: the command runs the source it was started from. Every
  Codex thread has it, with the server's own `bin/archboard` first on its PATH,
  so a workhorse that works in a worktree still talks to the server that
  started it.
- If the server on that port runs the source of another checkout, the command
  refuses and names both checkouts. It does not try another port. Run the
  command in the checkout that the refusal names, or stop that server there.

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
  ./bin/archboard -C "$session" semantic new payments --doing "drawing the payment path"

./bin/archboard -C "$session" semantic show payments

./bin/archboard -C "$session" semantic branch payments --as "Queued ingest" \
  --summary "Orders arrive through a queue" \
  --expect-version 1 --doing "proposing a queue"

echo '{"nodes": [{"name": "Order queue", "kind": "queue"}],
  "edges": [{"from": "API Gateway", "to": "Order queue", "kind": "queue",
             "label": "enqueue the order"},
            {"from": "Order queue", "to": "Orders", "kind": "queue",
             "label": "deliver"}]}' |
  ./bin/archboard -C "$session" semantic edit payments --variant "Queued ingest" \
  --expect-version 2 --doing "routing orders through a queue"

./bin/archboard -C "$session" semantic compare payments --variant "Queued ingest"
./bin/archboard -C "$session" check
```

Each command prints its answer as JSON on stdout and one sentence on stderr.
The three writes take the board to versions 1, 2 and 3. `compare` reports the
queue and its two relationships as added. `check` runs every check: the
semantics check of the vault, the code check and the embeds check. It exits 0
when the configuration and every board are valid and neither the code check
nor the embeds check has a warning. The session's vault is in no Git checkout,
so the embeds check has no file to read there.

The board is the file `payments.semantic.json` in the vault. It holds the
current variant and every proposal. Write it only through the CLI.

## 4. Draw it

```bash
out=$(mktemp -d)
./bin/archboard -C "$session" semantic render payments --out "$out/payments.svg"
./bin/archboard -C "$session" semantic render payments --variant "Queued ingest" \
  --out "$out/proposal.svg"
./bin/archboard -C "$session" semantic rasterize payments --out "$out/payments.png"
```

Write pictures outside the checkout, because git does not ignore them there.
`render` needs no browser. It draws the current variant, or a proposal marked
against the current variant. `rasterize` needs Chromium or Google Chrome, as
[INSTALL.md](INSTALL.md#rendering-to-a-bitmap) describes. At the default scale,
the `width` and `height` in the answer of `rasterize` are the ones in the answer
of `render`.

With `--track --doing "..."`, `render` and `rasterize` also list the file on
the board as a tracked embed, and `check embeds` in the vault's repository then
reads that file too. Tracking needs the vault and the file in Git checkouts, so
the session above cannot use it.
`tests/system/semantic-boards/tracked-embeds.test.ts` runs it over four
repositories.

## 5. See it in a browser

Open `$ARCHBOARD_URL/?paneA=payments` in a browser. The `browser` commands need
that page. Without it, `browser show` exits with code 4 and tells you which URL
to open.

```bash
./bin/archboard browser panes
./bin/archboard -C "$session" browser show "payments@Queued ingest"
./bin/archboard browser open
./bin/archboard -C "$session" browser show payments --pane left
./bin/archboard -C "$session" browser show "payments@Queued ingest" --pane right
```

`browser panes` reports the board, the variant and the version of each pane,
and the repository and the checkout that the board is in.
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
  while a check still has a diagnostic or a warning.
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

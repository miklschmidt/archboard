# Running and verifying Archboard

This file is for a developer or an agent who works in this checkout. It shows
how to run a server of your own, write and read a model, see it in a browser,
and test a change. [INSTALL.md](INSTALL.md) covers installation on a machine.
[docs/agents/test-suite.md](docs/agents/test-suite.md) covers the test lanes.
`./bin/archboard --help` and the `--help` of each command describe the flags.

## 1. Prepare the checkout

Vite+ requires Node.js `^22.18.0 || ^24.11.0 || >=26.0.0` for build and validation tools.
Bun runs the product and its tests.

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
git -C "$session" init
git -C "$session" remote add origin https://example.invalid/web-shop.git
./bin/archboard -C "$session" model import \
  --input "$session/.archboard/vault/history.import.json"
./bin/archboard start
./bin/archboard status
```

`examples/web-shop` contains one canonical model, four proposals, independent flows, and walkthroughs.
Its import request restores the complete architecture archive beside the copied inputs.
Use your configured Git identity and signer for this scratch repository.
The synthetic origin identifies local example references. These commands never fetch that origin.
`start` prints the server URL and process ID. `status` reports whether it runs.

The commands below name the session with `-C "$session"`. Without it, a command
in this checkout uses the architecture of this repository. The first command that
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

`archboard` in this checkout finds the model of this repository in
`.archboard/vault`, from any directory of the checkout. Read the model as needed. Change it through a task proposal, as the `archboard-dev` skill describes.

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

## 3. Read and change the model

Read the copied example through the public model interface:

```bash
./bin/archboard -C "$session" model read
./bin/archboard -C "$session" model read 'Inventory service'
./bin/archboard -C "$session" model read --state 'Queued fulfilment'
./bin/archboard -C "$session" model compare --state 'Queued fulfilment'
./bin/archboard -C "$session" check
```

The current reading has eight root modules. Inventory owns its stock API, ledger, database, and synchronization job.
Opening a module changes the reading scope and preserves its identity.
The queued proposal compares its changed responsibilities and relationships against current architecture.
The recommendations proposals keep their separate planning root and competing approaches.

For a new proposal, follow the [canonical authoring recipe](skills/archboard/references/canonical-models.md).
Read the complete revision, claim the affected subjects, and submit one public edit request for the intended change.
Every write states its purpose through `--doing` or its complete operation request.
A stale revision refuses the write instead of overwriting later work.
Release the claim when the authoring intent ends.
Adoption and shelving require explicit lifecycle operations.

The working tree holds modules, source-owned relationships, flow collections, active proposal patches, and walkthroughs.
Exact history lives in the retained Git archive. A source commit does not replace architecture retention or adopt a proposal.
Use `model recover` in the original scratch checkout after an interrupted installation.
The [migration recipe](skills/archboard/references/legacy-migration.md) covers unmigrated legacy vaults without automatic rewriting.

## 4. Draw a reading

```bash
out=$(mktemp -d)
./bin/archboard -C "$session" model render --out "$out/shop.svg"
./bin/archboard -C "$session" model render --state 'Queued fulfilment' \
  --out "$out/proposal.svg"
./bin/archboard -C "$session" model render --module 'Inventory service' \
  --out "$out/inventory.svg"
./bin/archboard -C "$session" model rasterize --out "$out/shop.png"
```

Write temporary pictures outside the checkout.
Structural renders use the selected scope. Sequence and flowchart renders also name an authored flow and grammar.
`model rasterize` accepts the same reading selectors and needs Chromium, as [INSTALL.md](INSTALL.md#rendering-to-a-bitmap) describes.
Render recipes retain exact architecture references for reproducible output.
`check embeds` discovers tracked artifacts through Git and reads their embedded recipes.
It needs no board-owned tracking list.

## 5. Open the browser

Open `$ARCHBOARD_URL/?modelA=Shop` after the example registers with the server.
The browser commands address its existing panes:

```bash
./bin/archboard browser panes
./bin/archboard -C "$session" browser show Shop --state 'Queued fulfilment'
./bin/archboard browser open
./bin/archboard -C "$session" browser show Shop --pane A
./bin/archboard -C "$session" browser show Shop --state 'Queued fulfilment' --pane B
```

`browser panes` reports each pane's canonical architecture capture, repository, and chosen checkout.
The capture includes its reading, selection, and exact revision.
The state picker exposes current architecture, proposals, and retained readings.
Recursive navigation, selection, focus, filters, and walkthrough controls change presentation only.
Agent navigation never activates another workhorse conversation.

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
  using the Vite+ tasks in `vite.config.ts`. Include
  `test:modules` if it has not run. Run `frontend` and `workbench-example` before browser owners.
  Only then call a failure the only one.
- `bun install` supplies the pinned `agent-browser` CLI. The browser lane resolves it from this checkout.
  A missing prerequisite ends the lane with code 2.
- A new worktree needs `bun install` and `bun run build` first.

Some checks need a person, because they need a real voice, a microphone and
speakers:

- [The voice acceptance](docs/design/codex-workbench-voice-acceptance.md), for
  a change to the Codex workbench or its voice path.
- [The recording acceptance](docs/design/walkthrough-recording-acceptance.md),
  for a change to `model record` or `model replay`. Its automated owners
  run a real headless Chromium with a fake ffmpeg.
  `tests/system/server-state/canonical-walkthrough-recording.test.ts` records against a
  fake Codex, and `canonical-walkthrough-replay.test.ts` beside it renders a kept talk.

## 8. When something fails

- Read the structured `code`, `diagnostics`, and recovery fields when a model operation refuses.
  `check` exits 1 while a check still reports a diagnostic or warning.
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

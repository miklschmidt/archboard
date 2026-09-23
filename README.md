![archboard — a user shaping a room-scale cloud architecture hologram](docs/assets/archboard-banner-enterprise-dark.png)

# archboard

Archboard is a live architecture canvas where a coding agent states what a
system is and the renderer draws it.

The agent reads the code and states the architecture as meaning: parts,
containment, relationships. The renderer owns every coordinate, colour and
connector route, so one improvement to it improves every board at once. You
read the board, compare a proposal with what exists, and follow a node to the
code it is bound to.

```text
agent reads code  ->  states the architecture  ->  the renderer draws it
      ^                                                       |
      +------------------ you read it back ------------------+
```

Archboard is designed for architecture work rather than general-purpose
diagramming: understanding an existing system, comparing it with a proposal,
and keeping architectural nodes connected to the code they represent.

## What it does

- Keeps named boards as `.semantic.json` documents in an Obsidian vault, one
  document per board holding every variant of it.
- Shows a current architecture and a proposal side by side, then produces a
  semantic comparison between them.
- Gives agents concise read paths for the whole board, its subjects, and what
  somebody picked out.
- Binds nodes to repositories and source paths, so a node resolves to the code
  it stands for.
- Renders deterministic SVG and PNG, and narrates a walkthrough aloud as the
  user steps through it.
- Exposes the canvas through an agent-facing CLI and a loopback REST API for
  the application and local integrations.

The CLI is the primary interface. It lets a coding agent operate the canvas
from any shell. A connected browser immediately shows each committed change,
but named-board work does not depend on a browser session.

## Project status

Archboard is experimental and under active development. The core round trip is
working and tested: an agent can write a board, a user can edit it in the
browser, and the agent can read the edited structure and metadata back. The
architecture vocabulary and higher-level workflows are still evolving, so
expect interfaces to change before a stable release.

Archboard is distributed from source and is not published to npm. The
`private` flag in `package.json` prevents accidental package publication; it
does not restrict use of this repository. The code is available under the
[MIT License](LICENSE).

## Quick start

You need [Bun](https://bun.sh/) 1.2 or newer and Git. The server and CLI run
directly from TypeScript; only the browser frontend is built.

```bash
git clone https://github.com/miklschmidt/archboard.git
cd archboard
bun install
bun run build

export ARCHBOARD_VAULT=/path/to/an/obsidian-vault
./bin/canvas start
```

There is deliberately no default vault. Every board is a note, so the server
refuses to start until `ARCHBOARD_VAULT` points to the place where those notes
should live. Set it before starting the server. Obsidian itself is optional;
the vault is simply the directory that holds the board notes.

Open <http://127.0.0.1:3000>, then state a first board and read it back:

```bash
./bin/canvas semantic new payments --doing "describing payment processing" <<'JSON'
{
  "level": "system",
  "nodes": [
    { "name": "Gateway", "kind": "service", "responsibility": "Routes incoming requests" },
    { "name": "Orders", "kind": "service", "responsibility": "Accepts and tracks orders" }
  ],
  "edges": [{ "from": "Gateway", "to": "Orders", "kind": "http", "label": "place order" }]
}
JSON

./bin/canvas semantic show payments
./bin/canvas semantic render payments --out payments.svg
```

Two rules make collaboration visible and unambiguous:

1. Every write says what it is doing with a short present-tense `--doing` line,
   which appears on the canvas while the change lands.
2. Every change to an existing board states the version it was read against
   with `--expect-version`, and is refused if the board has moved since.

Run `./bin/canvas --help` for the complete command surface, and
`./bin/canvas help <command>` for one command: each command's help lists the
arguments and options it reads, including which of the shared options apply to
it. Reading, writing and rendering a board need no browser; only `browser ...`
commands inspect or control a connected browser session.

## Use it from another repository

Archboard is installed once per machine, not as a dependency of the codebase
being diagrammed. Put `bin/canvas` on your `PATH`, then run the installer from
the repository you want an agent to understand:

```bash
mkdir -p ~/.local/bin
ln -s /path/to/archboard/bin/canvas ~/.local/bin/archboard

cd /path/to/your-project
archboard install-skill
```

The installer copies the bundled agent skill, chooses or creates a vault, and
records the machine-specific command and vault path in the target repository's
agent instructions. See [INSTALL.md](INSTALL.md) for target options, shared
vaults and repository bindings.

Once installed, ask the agent to map the current architecture onto a named
board. A typical comparison branches that board into a proposal and opens the
two side by side:

```bash
archboard semantic branch payments --as "Queued ingest" --expect-version 1 \
  --doing "proposing a queue"
archboard browser open
archboard browser show "payments@Queued ingest" --pane right
```

There is no way to move a box, and deliberately none: a layout somebody
repaired by hand cannot be improved for every board at once. Ask the agent what
the proposal changes instead.

## How persistence and collaboration work

The file is the board. Archboard does not keep a second authoritative copy in
memory, and every accepted agent change is written atomically to the board's
`.semantic.json` document. A running browser renders what that document
contains.

Writes are coordinated per board. Agents claim a board for substantial work,
state what each write is doing, and re-read after a version conflict instead of
retrying blindly. Human interaction remains responsive and is never blocked by
an agent's lease. A node's code binding is part of its meaning and travels with
the board rather than storing a machine-local `file://` URL; tappable code
targets are derived for presentation from that portable binding and this
machine's checkout registry.

Each live pane may link explicitly to one Codex workhorse. Voice uses a separate
coordinator for that link, so conversation and sustained implementation do not
share a history. The
[bound app-server design](DESIGN.md#2-mid-conversation-context--the-bound-app-server-session)
defines semantic delivery, refusal, and uncertain outcomes.

## Security

The canvas binds to `127.0.0.1` by default and has no authentication. Keep it
on loopback; use an SSH tunnel rather than exposing it directly to a network.

Archboard owns one private package-local Codex app-server session over stdio.
It gives that child dedicated Codex state, config, and sign-in. The retired
shared-daemon and control-socket paths are unavailable.

## Documentation

- [INSTALL.md](INSTALL.md) — install archboard for use across repositories.
- [TESTING.md](TESTING.md) — run the complete Codex, voice, and canvas loop.
- [DESIGN.md](DESIGN.md) — product design, constraints, and roadmap.
- [CONTEXT.md](CONTEXT.md) — the domain language used by the CLI and docs.
- [docs/adr/](docs/adr/) — architectural decisions and their consequences.
- [AGENTS.md](AGENTS.md) — contributor and development instructions.

## Provenance

Archboard began as a fork of an upstream MCP drawing server at v2.0.0
(`6ddbe98`). The full upstream history is retained.

The project now diverges deliberately around the agent-authored architecture
workflow and is not kept mergeable with upstream. The upstream remote remains
useful for reference and selective fixes. Both copyright notices are retained
in [LICENSE](LICENSE).

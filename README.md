# archboard

Archboard is a live [Excalidraw](https://excalidraw.com) canvas where a coding
agent and a human explore software architecture together.

The agent reads the code and draws the system. You move a service, cut an edge,
or group a set of nodes on the canvas. The agent reads that change back as
design intent and can update the code or the proposed architecture in response.
The drawing is shared working state, not a picture revealed at the end.

```text
agent reads code  ->  draws the architecture  ->  you rearrange it
      ^                                                    |
      +-------------- agent reads it back -----------------+
```

Archboard is designed for architecture work rather than general-purpose
diagramming: understanding an existing system, comparing it with a proposal,
and keeping architectural nodes connected to the code they represent.

## What it does

- Keeps named boards as Excalidraw notes in an Obsidian vault.
- Shows a current architecture and a proposal side by side, then produces a
  semantic comparison between them.
- Gives agents concise read paths for the whole board, selected elements, and
  changes made by a person.
- Binds nodes to repositories and source paths through durable Excalidraw
  metadata.
- Provides a curated architecture stencil library, Mermaid import, layout
  operations, snapshots, and PNG, SVG, and Excalidraw export.
- Exposes the canvas through an agent-facing CLI and a loopback REST API for
  the application and local integrations.

The CLI is the primary interface. It lets a coding agent operate the canvas
from any shell while every change appears immediately in the browser.

## Project status

Archboard is experimental and under active development. The core round trip is
working and tested: an agent can write a board, a person can edit it in the
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

Open <http://127.0.0.1:3000>, then create and inspect a first board:

```bash
./bin/canvas board new payments --level service

./bin/canvas add --board payments \
  --doing "adding the API gateway" \
  --one '{"type":"rectangle","x":100,"y":100,"width":240,"height":80,"label":{"text":"API Gateway"}}'

./bin/canvas describe --board payments
./bin/canvas query --board payments --type rectangle
```

Two rules make collaboration visible and unambiguous:

1. Every command that touches board content names it with `--board`.
2. Every write includes a short present-tense `--doing` message, which appears
   on the canvas while the change lands.

Run `./bin/canvas --help` for the complete command surface. Most JSON
operations work without a browser tab; screenshots, Mermaid conversion, image
export, viewport control, and panes require one.

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
board. A typical comparison branches that board into a variant and opens the
two side by side:

```bash
archboard board save --board payments --variant option-a \
  --doing "branching the queue proposal"
archboard pane open --board payments@option-a
archboard compare payments payments@option-a
```

Moving a box on either side is part of the conversation: ask the agent to read
the board again and explain what your rearrangement implies.

## How persistence and collaboration work

The note is the board. Archboard does not keep a second authoritative scene in
memory, and every accepted human or agent change is written atomically to its
`.excalidraw.md` note. A running browser renders what the note contains.

Writes are coordinated per board. Agents claim a board for substantial work,
state what each write is doing, and re-read after a version conflict instead of
retrying blindly. Human interaction remains responsive and is never blocked by
an agent's lease. Archboard metadata lives under `customData.archboard`, so code
bindings survive a browser edit and an Obsidian round trip without storing
machine-local `file://` URLs. Human-authored Excalidraw links are preserved;
tappable code targets are derived for presentation from the portable binding
and this machine's checkout registry.

## Security

The canvas binds to `127.0.0.1` by default and has no authentication. Keep it
on loopback; use an SSH tunnel rather than exposing it directly to a network.

Optional injection into a live Codex thread is disabled by default, must be
enabled explicitly with `ARCHBOARD_INJECT=1`, must name the exact task with
`ARCHBOARD_INJECT_THREAD`, and refuses to arm when the canvas is not bound to
loopback. See [TESTING.md](TESTING.md) before enabling voice or injection.

## Documentation

- [INSTALL.md](INSTALL.md) — install archboard for use across repositories.
- [TESTING.md](TESTING.md) — run the complete Codex, voice, and canvas loop.
- [DESIGN.md](DESIGN.md) — product design, constraints, and roadmap.
- [CONTEXT.md](CONTEXT.md) — the domain language used by the CLI and docs.
- [FLIP_WHITEBOARD.md](FLIP_WHITEBOARD.md) — large-touchscreen setup.
- [docs/adr/](docs/adr/) — architectural decisions and their consequences.
- [AGENTS.md](AGENTS.md) — contributor and development instructions.

## Provenance

Archboard began as a fork of
[yctimlin/mcp_excalidraw](https://github.com/yctimlin/mcp_excalidraw) v2.0.0
(`6ddbe98`). The full upstream history is retained.

The project now diverges deliberately around the agent-human architecture
workflow and is not kept mergeable with upstream. The upstream remote remains
useful for reference and selective fixes. Both copyright notices are retained
in [LICENSE](LICENSE).
